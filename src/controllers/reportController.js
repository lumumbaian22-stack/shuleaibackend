const crypto = require('crypto');
const { AcademicRecord, ReportSnapshot, Student, User, AuditLog } = require('../models');
function grade(score){ const s=Number(score||0); if(s>=80)return 'EE'; if(s>=60)return 'ME'; if(s>=40)return 'AE'; return 'BE'; }
function schoolCode(req){ return req.user?.schoolCode || req.body?.schoolCode || req.query?.schoolCode; }
function checksum(obj){ return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }
async function buildSnapshot({studentId, schoolCode, term, year}){ const student=await Student.findByPk(studentId,{include:[{model:User,attributes:['id','name','email','schoolCode']} ]}); if(!student) throw new Error('Student not found'); const records=await AcademicRecord.findAll({where:{studentId,schoolCode,term,year},order:[['subject','ASC'],['assessmentName','ASC']]}); const subjects={}; records.forEach(r=>{ const raw=r.toJSON(); subjects[raw.subject]=subjects[raw.subject]||[]; subjects[raw.subject].push(raw); }); const summary=Object.entries(subjects).map(([subject,rows])=>{ const avg=Math.round(rows.reduce((a,b)=>a+Number(b.score||0),0)/Math.max(rows.length,1)); return {subject,average:avg,grade:grade(avg),assessments:rows}; }); const overallAverage=summary.length?Math.round(summary.reduce((a,b)=>a+b.average,0)/summary.length):null; return { student: student.toJSON(), term, year, subjects:summary, overallAverage, overallGrade:overallAverage==null?null:grade(overallAverage), generatedAt:new Date().toISOString() }; }
exports.generateReport = async(req,res)=>{ try{ const {studentId,term='Term 1',year=new Date().getFullYear(),publish=false}=req.body; if(!studentId) return res.status(400).json({success:false,message:'studentId is required'}); const sc=schoolCode(req); const snapshot=await buildSnapshot({studentId,schoolCode:sc,term,year:Number(year)}); const sourceRecordIds=snapshot.subjects.flatMap(s=>s.assessments.map(a=>a.id)); const [row]=await ReportSnapshot.findOrCreate({where:{schoolCode:sc,studentId,term,year:Number(year),reportType:'academic'},defaults:{schoolCode:sc,studentId,term,year:Number(year),curriculum:snapshot.student.curriculum,generatedBy:req.user.id,status:publish?'published':'draft',publishedBy:publish?req.user.id:null,publishedAt:publish?new Date():null,snapshot,sourceRecordIds,checksum:checksum(snapshot)}}); if(row.status==='published') return res.status(409).json({success:false,message:'Published report is locked. Archive it or create a new term/year snapshot.'}); await row.update({snapshot,sourceRecordIds,checksum:checksum(snapshot),status:publish?'published':'draft',publishedBy:publish?req.user.id:null,publishedAt:publish?new Date():null}); await AuditLog?.create({schoolCode:sc,actorUserId:req.user.id,actorRole:req.user.role,module:'reports',action:publish?'report_published':'report_generated',entityType:'ReportSnapshot',entityId:String(row.id),after:row.toJSON()}); res.json({success:true,data:row}); }catch(e){res.status(500).json({success:false,message:e.message});} };
exports.listReports = async(req,res)=>{ try{ const where={schoolCode:schoolCode(req)}; if(req.query.studentId) where.studentId=req.query.studentId; if(req.query.term) where.term=req.query.term; if(req.query.year) where.year=Number(req.query.year); const rows=await ReportSnapshot.findAll({where,order:[['updatedAt','DESC']],limit:500}); res.json({success:true,data:rows}); }catch(e){res.status(500).json({success:false,message:e.message});} };
exports.getReport = async(req,res)=>{ try{ const row=await ReportSnapshot.findOne({where:{id:req.params.id,schoolCode:schoolCode(req)}}); if(!row)return res.status(404).json({success:false,message:'Report not found'}); res.json({success:true,data:row}); }catch(e){res.status(500).json({success:false,message:e.message});} };

// ============ V102 CURRICULUM-AWARE MANUAL REPORT GENERATION ============
const v102CurriculumEngine = require('../services/curriculumStructureEngine');
const v102Selections = require('../services/studentSubjectSelectionService');
const { School, Class } = require('../models');

exports.generateReport = async(req,res)=>{
  try{
    const { studentId, term='Term 1', year=new Date().getFullYear(), publish=false } = req.body;
    if(!studentId) return res.status(400).json({success:false,message:'studentId is required'});
    const sc=schoolCode(req);
    const student=await Student.findByPk(studentId,{include:[{model:User,attributes:['id','name','email','schoolCode']} ]});
    if(!student) return res.status(404).json({success:false,message:'Student not found'});
    if(student.User?.schoolCode && student.User.schoolCode !== sc) return res.status(403).json({success:false,message:'Forbidden'});
    const school = await School.findOne({ where:{ schoolId:sc } });
    const cls = student.classId ? await Class.findOne({ where:{ id:student.classId, schoolCode:sc } }) : await Class.findOne({ where:{ schoolCode:sc, [require('sequelize').Op.or]:[{ name:student.grade }, { grade:student.grade }] } });
    const records=await AcademicRecord.findAll({where:{studentId,schoolCode:sc,term,year:Number(year)},order:[['subject','ASC'],['assessmentName','ASC']]});
    const selections = cls ? await v102Selections.listStudentSubjectSelections({ schoolCode:sc, studentId, classId:cls.id }).catch(() => []) : [];
    if (!school || !cls) return res.status(400).json({ success:false, message:'Class/curriculum setup is required before generating report cards.' });
    const reportRows = v102CurriculumEngine.buildSubjectRowsForReport({ school, classItem:cls, student, records, studentSubjectSelections:selections });
    if (!reportRows.length) return res.status(400).json({ success:false, message:'No valid subjects found for this class. Save the curriculum structure and Add Subjects checklist first.' });
    const summary = v102CurriculumEngine.summarizeReportRows(reportRows);
    const subjects = reportRows.map(r => ({ subject:r.subject, average:r.score, grade:r.score == null ? null : grade(r.score), status:r.status, counted:r.counted, assessments:r.assessments }));
    const overallAverage = summary.average;
    const snapshot={ student:student.toJSON(), class:cls, term, year:Number(year), curriculum:school?.system || student.curriculum, subjects, reportRows, totalMarks:summary.totalMarks, countedSubjects:summary.countedSubjects, pendingSubjects:summary.pendingSubjects, notTakenSubjects:summary.notTakenSubjects, overallAverage, overallGrade:overallAverage==null?null:grade(overallAverage), generatedAt:new Date().toISOString(), calculationRule:'Only valid completed subjects the student is taking are counted. Pending/null and Not Taken subjects are not counted.' };
    const sourceRecordIds=records.map(r=>r.id);
    const [row]=await ReportSnapshot.findOrCreate({where:{schoolCode:sc,studentId,term,year:Number(year),reportType:'academic'},defaults:{schoolCode:sc,studentId,term,year:Number(year),curriculum:snapshot.curriculum,generatedBy:req.user.id,status:publish?'published':'draft',publishedBy:publish?req.user.id:null,publishedAt:publish?new Date():null,snapshot,sourceRecordIds,checksum:checksum(snapshot),metadata:{engine:'v102_curriculum_report_card'}}});
    if(row.status==='published') return res.status(409).json({success:false,message:'Published report is locked. Archive it or create a new term/year snapshot.'});
    await row.update({snapshot,sourceRecordIds,checksum:checksum(snapshot),status:publish?'published':'draft',publishedBy:publish?req.user.id:null,publishedAt:publish?new Date():null,metadata:{...(row.metadata||{}),engine:'v102_curriculum_report_card'}});
    await AuditLog?.create({schoolCode:sc,actorUserId:req.user.id,actorRole:req.user.role,module:'reports',action:publish?'report_published':'report_generated',entityType:'ReportSnapshot',entityId:String(row.id),after:row.toJSON()}).catch(() => null);
    res.json({success:true,data:row});
  }catch(e){ console.error('V102 generate report error:', e); res.status(500).json({success:false,message:e.message}); }
};
