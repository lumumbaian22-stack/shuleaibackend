const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { sequelize, Student, User, Class, StudentEnrollment, PromotionBatch, PromotionDecision, ReportSnapshot, AuditLog } = require('../models');
const realtime = require('../services/realtimeService');
const subjectSelections = require('../services/studentSubjectSelectionService');

const OUTCOMES = new Set(['promote','repeat','move_stream','graduate','transfer_out','withdraw','hold_review']);
function code(req){ return req.user?.schoolCode; }
function isoToday(){ return new Date().toISOString().slice(0,10); }
function text(v){ return String(v || '').trim().toLowerCase(); }
function rankClass(cls){
  const s = `${cls.levelCode || ''} ${cls.levelLabel || ''} ${cls.grade || ''} ${cls.name || ''}`.toLowerCase();
  let m;
  if ((m=s.match(/(?:pp|pre[- ]?primary)\s*([12])/))) return Number(m[1]);
  if ((m=s.match(/grade\s*(\d{1,2})/))) return 2 + Number(m[1]);
  if ((m=s.match(/standard\s*(\d)/))) return 20 + Number(m[1]);
  if ((m=s.match(/form\s*(\d)/))) return 28 + Number(m[1]);
  return 1000;
}
function sameLevel(a,b){ return rankClass(a) === rankClass(b); }
function curriculumFamily(cls){
  const value=`${cls?.levelCode||''} ${cls?.levelLabel||''} ${cls?.grade||''} ${cls?.name||''}`.toLowerCase();
  if(/\b(pp\s*[12]|pre[- ]?primary|grade\s*\d{1,2})\b/.test(value))return 'cbe';
  if(/\b(standard\s*\d|form\s*\d)\b/.test(value))return '844';
  return String(cls?.curriculum||cls?.system||'other').toLowerCase();
}
function isTerminalClass(cls){const value=`${cls?.levelCode||''} ${cls?.levelLabel||''} ${cls?.grade||''} ${cls?.name||''}`.toLowerCase();return /grade\s*12\b|form\s*4\b/.test(value);}
function nextClassesFor(current, classes){
  if(!current||isTerminalClass(current))return [];
  const currentRank=rankClass(current),family=curriculumFamily(current);
  if(currentRank>=1000)return [];
  const candidates=classes.filter(c=>curriculumFamily(c)===family&&rankClass(c)>currentRank).sort((a,b)=>rankClass(a)-rankClass(b)||Number(a.id)-Number(b.id));
  if(!candidates.length)return [];
  const nextRank=rankClass(candidates[0]);
  return candidates.filter(candidate=>rankClass(candidate)===nextRank);
}
function chooseBalancedDestination(current,classes,proposedCounts){
  const candidates=nextClassesFor(current,classes);
  return candidates.sort((a,b)=>(proposedCounts.get(Number(a.id))||0)-(proposedCounts.get(Number(b.id))||0)||Number(a.id)-Number(b.id))[0]||null;
}
async function ensureCurrentEnrollment(student, cls, year, actorId, transaction){
  let row = await StudentEnrollment.findOne({ where:{ schoolCode:student.User.schoolCode, studentId:student.id, status:'active' }, order:[['effectiveFrom','DESC']], transaction, lock:transaction.LOCK.UPDATE });
  if (!row) row = await StudentEnrollment.create({ schoolCode:student.User.schoolCode, studentId:student.id, classId:cls?.id || student.classId || null, stream:cls?.stream || null, academicYear:Number(year), status:'active', effectiveFrom:`${year}-01-01`, createdBy:actorId, metadata:{ migratedFromStudent:true } }, { transaction });
  if (Number(student.activeEnrollmentId)!==Number(row.id)) await student.update({ activeEnrollmentId:row.id }, { transaction, hooks:false });
  return row;
}
async function loadBatch(req,id,transaction){ return PromotionBatch.findOne({ where:{ id:Number(id), schoolCode:code(req) }, transaction, lock:transaction?.LOCK?.UPDATE }); }

exports.preview = async (req,res)=>{
  const transaction=await sequelize.transaction();
  try{
    const closingYear=Number(req.body.closingYear), newYear=Number(req.body.newYear), effectiveDate=String(req.body.effectiveDate || `${newYear}-01-01`).slice(0,10);
    if(!closingYear||!newYear||newYear<=closingYear){ await transaction.rollback(); return res.status(400).json({success:false,message:'Choose a valid closing year and a later new academic year'}); }
    const classes=await Class.findAll({where:{schoolCode:code(req),isActive:true},transaction});
    const classIds=classes.map(c=>c.id);
    const students=await (Student.unscoped?Student.unscoped():Student).findAll({ where:{status:'active',classId:{[Op.in]:classIds}}, include:[{model:User,where:{schoolCode:code(req),role:'student'},attributes:['id','name','schoolCode']}], transaction });
    const batch=await PromotionBatch.create({schoolCode:code(req),closingYear,newYear,effectiveDate,status:'draft',createdBy:req.user.id,summary:{total:students.length},metadata:{placementMode:'balanced_preview'}},{transaction});
    const proposedCounts=new Map(classes.map(cls=>[Number(cls.id),0]));
    for(const st of students){
      const current=classes.find(c=>Number(c.id)===Number(st.classId));
      const enrollment=await ensureCurrentEnrollment(st,current,closingYear,req.user.id,transaction);
      const activeEnrollmentCount=await StudentEnrollment.count({where:{schoolCode:code(req),studentId:st.id,status:'active'},transaction});
      const next=chooseBalancedDestination(current,classes,proposedCounts);
      if(next)proposedCounts.set(Number(next.id),(proposedCounts.get(Number(next.id))||0)+1);
      const warnings=[];
      if(!current) warnings.push('Current class is missing or inactive');
      if(activeEnrollmentCount>1)warnings.push('Multiple active enrolments require review');
      if(!next&&current&&!isTerminalClass(current))warnings.push(`No valid next ${curriculumFamily(current).toUpperCase()} class exists in this school`);
      if(next&&curriculumFamily(next)!==curriculumFamily(current))warnings.push('Invalid curriculum transition');
      const finalReport=await ReportSnapshot.findOne({where:{schoolCode:code(req),studentId:st.id,year:closingYear,status:'published',isCurrent:true},transaction});
      if(!finalReport) warnings.push('No published final report found for the closing year');
      if(next&&/grade\s*1[0-2]\b|senior/i.test(`${next.name||''} ${next.grade||''} ${next.levelCode||''}`)){
        const selections=await subjectSelections.listStudentSubjectSelections({schoolCode:code(req),studentId:st.id}).catch(()=>[]);
        if(!selections.some(row=>['taking','approved','parent_supported'].includes(String(row.status||'').toLowerCase())))warnings.push('Senior-school subject/pathway selection is missing');
      }
      let outcome=next?'promote':'graduate';
      if(!current||warnings.some(w=>/Multiple active|Invalid curriculum/i.test(w)))outcome='hold_review';
      await PromotionDecision.create({schoolCode:code(req),batchId:batch.id,studentId:st.id,currentEnrollmentId:enrollment.id,fromClassId:current?.id||null,toClassId:next?.id||null,fromStream:current?.stream||null,toStream:next?.stream||null,outcome,warnings,status:warnings.length?'warning':'proposed',metadata:{studentName:st.User?.name||null,fromClassName:current?.name||null,toClassName:next?.name||null,curriculumFamily:current?curriculumFamily(current):null,placementMode:'balanced_preview'}},{transaction});
    }
    await transaction.commit();
    return exports.getBatch({...req,params:{id:batch.id}},res);
  }catch(error){if(!transaction.finished)await transaction.rollback();res.status(500).json({success:false,message:error.message});}
};

exports.getBatch=async(req,res)=>{
  try{
    const batch=await PromotionBatch.findOne({where:{id:Number(req.params.id),schoolCode:code(req)},include:[{model:PromotionDecision,include:[{model:Student,include:[{model:User,attributes:['id','name','profileImage']}]}]}],order:[[PromotionDecision,'id','ASC']]});
    if(!batch)return res.status(404).json({success:false,message:'Promotion batch not found'});
    res.json({success:true,data:batch});
  }catch(error){res.status(500).json({success:false,message:error.message});}
};

exports.listBatches=async(req,res)=>{try{res.json({success:true,data:await PromotionBatch.findAll({where:{schoolCode:code(req)},order:[['createdAt','DESC']],limit:50})});}catch(error){res.status(500).json({success:false,message:error.message});}};

exports.updateDecision=async(req,res)=>{
  try{
    const decision=await PromotionDecision.findOne({where:{id:Number(req.params.decisionId),schoolCode:code(req)},include:[PromotionBatch]});
    if(!decision||decision.PromotionBatch?.status!=='draft')return res.status(409).json({success:false,message:'Only draft promotion decisions can be changed'});
    const outcome=String(req.body.outcome||decision.outcome);
    if(!OUTCOMES.has(outcome))return res.status(400).json({success:false,message:'Invalid promotion outcome'});
    let toClassId=req.body.toClassId===undefined?decision.toClassId:(req.body.toClassId?Number(req.body.toClassId):null);
    if(['promote','move_stream'].includes(outcome)&&!toClassId)return res.status(400).json({success:false,message:'A destination class is required'});
    if(outcome==='repeat')toClassId=decision.fromClassId;
    const destination=toClassId?await Class.findOne({where:{id:toClassId,schoolCode:code(req),isActive:true}}):null;
    await decision.update({outcome,toClassId,toStream:req.body.toStream!==undefined?req.body.toStream:(destination?.stream||decision.toStream),status:'proposed',warnings:[]});
    res.json({success:true,data:decision});
  }catch(error){res.status(500).json({success:false,message:error.message});}
};

async function applyBatch(batch,actorId,transaction){
  const decisions=await PromotionDecision.findAll({where:{batchId:batch.id,schoolCode:batch.schoolCode},transaction,lock:transaction.LOCK.UPDATE});
  const summary={promote:0,repeat:0,move_stream:0,graduate:0,transfer_out:0,withdraw:0,hold_review:0,unresolved:0};
  for(const d of decisions){
    summary[d.outcome]=(summary[d.outcome]||0)+1;
    if(d.outcome==='hold_review'){summary.unresolved++;continue;}
    const student=await (Student.unscoped?Student.unscoped():Student).findByPk(d.studentId,{transaction,lock:transaction.LOCK.UPDATE});
    if(!student){summary.unresolved++;continue;}
    const old=await StudentEnrollment.findOne({where:{id:d.currentEnrollmentId,schoolCode:batch.schoolCode},transaction,lock:transaction.LOCK.UPDATE});
    if(['promote','repeat','move_stream'].includes(d.outcome)){
      const exists=await StudentEnrollment.findOne({where:{schoolCode:batch.schoolCode,studentId:d.studentId,academicYear:batch.newYear,status:'active'},transaction,lock:transaction.LOCK.UPDATE});
      if(exists){summary.unresolved++;await d.update({status:'blocked',warnings:['Duplicate active enrolment for the new year']},{transaction});continue;}
      if(!d.toClassId){summary.unresolved++;await d.update({status:'blocked',warnings:['Destination class is missing']},{transaction});continue;}
      if(old)await old.update({status:'closed',effectiveTo:batch.effectiveDate,endedReason:d.outcome,closedBy:actorId,version:Number(old.version||1)+1},{transaction,hooks:false});
      const created=await StudentEnrollment.create({schoolCode:batch.schoolCode,studentId:d.studentId,classId:d.toClassId,stream:d.toStream,academicYear:batch.newYear,status:'active',effectiveFrom:batch.effectiveDate,createdBy:actorId,metadata:{promotionBatchId:batch.id,previousEnrollmentId:old?.id||null,outcome:d.outcome}},{transaction});
      await student.update({classId:d.toClassId,grade:(await Class.findByPk(d.toClassId,{transaction}))?.name||student.grade,activeEnrollmentId:created.id,status:'active'},{transaction,hooks:false});
      await d.update({status:'applied',appliedEnrollmentId:created.id},{transaction});
    }else{
      if(old)await old.update({status:'closed',effectiveTo:batch.effectiveDate,endedReason:d.outcome,closedBy:actorId,version:Number(old.version||1)+1},{transaction,hooks:false});
      const status=d.outcome==='graduate'?'graduated':d.outcome==='transfer_out'?'transferred':'inactive';
      await student.update({status,activeEnrollmentId:null},{transaction,hooks:false});
      await d.update({status:'applied'},{transaction});
    }
  }
  await batch.update({status:'applied',confirmedBy:actorId,confirmedAt:new Date(),summary},{transaction});
  await AuditLog.create({schoolCode:batch.schoolCode,actorUserId:actorId,actorRole:'admin',module:'student_lifecycle',action:'promotion_applied',entityType:'PromotionBatch',entityId:String(batch.id),after:summary,metadata:{effectiveDate:batch.effectiveDate,newYear:batch.newYear}},{transaction});
  await realtime.emit({type:'promotion:completed',schoolCode:batch.schoolCode,audience:{school:true},entityType:'PromotionBatch',entityId:batch.id,version:1,data:{batchId:batch.id,effectiveDate:batch.effectiveDate,newYear:batch.newYear,summary},transaction});
  await realtime.emitToSchool(batch.schoolCode,'analytics:invalidated',{scope:'students_and_academics',batchId:batch.id},{transaction});
  return summary;
}

exports.confirm=async(req,res)=>{
  const transaction=await sequelize.transaction();
  try{
    const batch=await loadBatch(req,req.params.id,transaction);
    if(!batch||batch.status!=='draft'){await transaction.rollback();return res.status(409).json({success:false,message:'Only a draft promotion batch can be confirmed'});}
    const blocked=await PromotionDecision.count({where:{batchId:batch.id,outcome:'hold_review'},transaction});
    if(blocked&&!req.body.allowUnresolved){await transaction.rollback();return res.status(409).json({success:false,message:`${blocked} learner(s) are still held for review. Resolve them or explicitly allow unresolved records.`});}
    if(batch.effectiveDate>isoToday()){
      await batch.update({status:'scheduled',confirmedBy:req.user.id,confirmedAt:new Date(),summary:{...(batch.summary||{}),unresolved:blocked}},{transaction});
      await transaction.commit();
      return res.json({success:true,message:`Promotion scheduled for ${batch.effectiveDate}. Current classes remain active until that date.`,data:batch});
    }
    const summary=await applyBatch(batch,req.user.id,transaction);
    await transaction.commit();
    res.json({success:true,message:'Academic-year transition completed without deleting historical records.',data:{batchId:batch.id,summary}});
  }catch(error){if(!transaction.finished)await transaction.rollback();res.status(500).json({success:false,message:error.message});}
};

exports.applyDueSystem = async () => {
  const transaction = await sequelize.transaction();
  try {
    const batches = await PromotionBatch.findAll({ where:{ status:'scheduled', effectiveDate:{ [Op.lte]:isoToday() } }, transaction, lock:transaction.LOCK.UPDATE });
    const results = [];
    for (const batch of batches) {
      const actorId = batch.confirmedBy || batch.createdBy;
      results.push({ batchId:batch.id, schoolCode:batch.schoolCode, summary:await applyBatch(batch, actorId, transaction) });
    }
    await transaction.commit();
    return results;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

exports.applyDue=async(req,res)=>{
  const transaction=await sequelize.transaction();
  try{
    const batches=await PromotionBatch.findAll({where:{schoolCode:code(req),status:'scheduled',effectiveDate:{[Op.lte]:isoToday()}},transaction,lock:transaction.LOCK.UPDATE});
    const results=[];for(const batch of batches)results.push({batchId:batch.id,summary:await applyBatch(batch,req.user.id,transaction)});
    await transaction.commit();res.json({success:true,data:results});
  }catch(error){if(!transaction.finished)await transaction.rollback();res.status(500).json({success:false,message:error.message});}
};

exports.rollback=async(req,res)=>{
  const transaction=await sequelize.transaction();
  try{
    const batch=await loadBatch(req,req.params.id,transaction);
    if(!batch||batch.status!=='applied'){await transaction.rollback();return res.status(409).json({success:false,message:'Only an applied transition can be rolled back'});}
    const reason=String(req.body.reason||'').trim();if(!reason){await transaction.rollback();return res.status(400).json({success:false,message:'A rollback reason is required'});}
    const decisions=await PromotionDecision.findAll({where:{batchId:batch.id,status:'applied'},transaction,lock:transaction.LOCK.UPDATE});
    for(const d of decisions){
      const student=await (Student.unscoped?Student.unscoped():Student).findByPk(d.studentId,{transaction,lock:transaction.LOCK.UPDATE});
      if(d.appliedEnrollmentId){const newer=await StudentEnrollment.findByPk(d.appliedEnrollmentId,{transaction,lock:transaction.LOCK.UPDATE});if(newer)await newer.update({status:'reversed',effectiveTo:isoToday(),endedReason:'promotion_rollback',closedBy:req.user.id},{transaction});}
      const old=await StudentEnrollment.findByPk(d.currentEnrollmentId,{transaction,lock:transaction.LOCK.UPDATE});
      if(old){await old.update({status:'active',effectiveTo:null,endedReason:null,closedBy:null,version:Number(old.version||1)+1},{transaction,hooks:false});await student?.update({classId:old.classId,grade:(await Class.findByPk(old.classId,{transaction}))?.name||student.grade,activeEnrollmentId:old.id,status:'active'},{transaction,hooks:false});}
      await d.update({status:'reversed',metadata:{...(d.metadata||{}),rollbackReason:reason,rolledBackAt:new Date().toISOString()}},{transaction});
    }
    await batch.update({status:'rolled_back',rollbackBy:req.user.id,rollbackAt:new Date(),metadata:{...(batch.metadata||{}),rollbackReason:reason}},{transaction});
    await AuditLog.create({schoolCode:code(req),actorUserId:req.user.id,actorRole:req.user.role,module:'student_lifecycle',action:'promotion_rolled_back',entityType:'PromotionBatch',entityId:String(batch.id),reason},{transaction});
    await realtime.emitToSchool(code(req),'promotion:rolled_back',{batchId:batch.id,reason},{transaction});
    await transaction.commit();res.json({success:true,message:'Promotion rollback completed and previous enrolments restored.',data:{batchId:batch.id}});
  }catch(error){if(!transaction.finished)await transaction.rollback();res.status(500).json({success:false,message:error.message});}
};

exports.enrollmentHistory=async(req,res)=>{try{const student=await (Student.unscoped?Student.unscoped():Student).findOne({where:{id:Number(req.params.studentId)},include:[{model:User,where:{schoolCode:code(req)}}]});if(!student)return res.status(404).json({success:false,message:'Student not found'});res.json({success:true,data:await StudentEnrollment.findAll({where:{schoolCode:code(req),studentId:student.id},include:[Class],order:[['academicYear','DESC'],['effectiveFrom','DESC']]})});}catch(error){res.status(500).json({success:false,message:error.message});}};


exports.exportBatch = async (req,res) => {
  try {
    const format=String(req.params.format||'xlsx').toLowerCase();
    const batch=await PromotionBatch.findOne({where:{id:Number(req.params.id),schoolCode:code(req)},include:[{model:PromotionDecision,include:[{model:Student,include:[{model:User,attributes:['id','name']}]}]}]});
    if(!batch)return res.status(404).json({success:false,message:'Promotion batch not found'});
    const decisions=batch.PromotionDecisions||[];
    const classes=await Class.findAll({where:{schoolCode:code(req)},attributes:['id','name','stream']});
    const className=id=>classes.find(c=>Number(c.id)===Number(id))?.name||'';
    const rows=decisions.map(d=>({
      student:d.Student?.User?.name||d.metadata?.studentName||`Student ${d.studentId}`,
      fromClass:className(d.fromClassId)||d.metadata?.fromClassName||'',
      toClass:className(d.toClassId)||d.metadata?.toClassName||'',
      fromStream:d.fromStream||'',toStream:d.toStream||'',outcome:d.outcome,status:d.status,
      warnings:Array.isArray(d.warnings)?d.warnings.join('; '):''
    }));
    const base=`Academic_Year_Transition_${batch.closingYear}_to_${batch.newYear}`;
    if(format==='pdf'){
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${base}_Summary.pdf"`);
      const doc=new PDFDocument({size:'A4',margin:40});doc.pipe(res);
      doc.font('Helvetica-Bold').fontSize(18).text('Academic Year Transition Summary',{align:'center'});
      doc.moveDown(.5).font('Helvetica').fontSize(10).text(`Closing year: ${batch.closingYear}    New year: ${batch.newYear}    Effective date: ${batch.effectiveDate}    Status: ${batch.status}`,{align:'center'});
      doc.moveDown();const grouped=rows.reduce((a,r)=>{a[r.outcome]=(a[r.outcome]||0)+1;return a;},{});
      Object.entries(grouped).forEach(([k,v])=>doc.font('Helvetica-Bold').fontSize(11).text(`${k.replace(/_/g,' ')}: ${v}`));
      doc.moveDown().font('Helvetica-Bold').fontSize(10).text('Learner decisions');
      rows.forEach((r,i)=>{if(doc.y>740)doc.addPage();doc.font('Helvetica').fontSize(8).text(`${i+1}. ${r.student} — ${r.fromClass||'—'} → ${r.toClass||r.outcome} — ${r.outcome}${r.warnings?` — ${r.warnings}`:''}`);});
      doc.end();return;
    }
    if(format!=='xlsx')return res.status(400).json({success:false,message:'Use pdf or xlsx export format'});
    const workbook=new ExcelJS.Workbook();workbook.creator='Shule AI';workbook.created=new Date();
    const addSheet=(name,data)=>{const ws=workbook.addWorksheet(name);ws.columns=[{header:'Student',key:'student',width:28},{header:'From Class',key:'fromClass',width:18},{header:'To Class',key:'toClass',width:18},{header:'From Stream',key:'fromStream',width:14},{header:'To Stream',key:'toStream',width:14},{header:'Outcome',key:'outcome',width:18},{header:'Status',key:'status',width:15},{header:'Warnings',key:'warnings',width:45}];ws.addRows(data);ws.getRow(1).font={bold:true};ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:'H1'};};
    const overview=workbook.addWorksheet('Overview');overview.addRows([['Closing Year',batch.closingYear],['New Year',batch.newYear],['Effective Date',String(batch.effectiveDate)],['Status',batch.status],['Total Learners',rows.length],...Object.entries(rows.reduce((a,r)=>{a[r.outcome]=(a[r.outcome]||0)+1;return a;},{})).map(([k,v])=>[k.replace(/_/g,' '),v])]);overview.getColumn(1).width=28;overview.getColumn(2).width=20;overview.getColumn(1).font={bold:true};
    addSheet('Promoted Students',rows.filter(r=>['promote','move_stream'].includes(r.outcome)));
    addSheet('Repeaters',rows.filter(r=>r.outcome==='repeat'));
    addSheet('Graduates',rows.filter(r=>r.outcome==='graduate'));
    addSheet('Transfers Withdrawals',rows.filter(r=>['transfer_out','withdraw'].includes(r.outcome)));
    addSheet('Unresolved Students',rows.filter(r=>r.outcome==='hold_review'||r.status==='blocked'||r.warnings));
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${base}.xlsx"`);await workbook.xlsx.write(res);res.end();
  }catch(error){if(!res.headersSent)res.status(500).json({success:false,message:error.message});else res.end();}
};
