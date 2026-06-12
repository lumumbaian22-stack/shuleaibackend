const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const { ReportSnapshot, ReportShare, Student, Parent, StudentParent, Teacher, Class, User } = require('../models');
const snapshotService = require('../services/reportSnapshotService');

function code(req) { return req.user?.schoolCode; }
async function studentForUser(userId) { return (Student.unscoped ? Student.unscoped() : Student).findOne({ where:{ userId } }); }
async function canRead(req, report) {
  if (!report || String(report.schoolCode) !== String(code(req))) return false;
  if (['admin','super_admin'].includes(req.user.role)) return true;
  if (req.user.role === 'student') return Number((await studentForUser(req.user.id))?.id) === Number(report.studentId);
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ where:{ userId:req.user.id } });
    return Boolean(parent && await StudentParent.findOne({ where:{ parentId:parent.id, studentId:report.studentId } }));
  }
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ where:{ userId:req.user.id } });
    const cls = report.classId ? await Class.findOne({ where:{ id:report.classId, schoolCode:code(req) } }) : null;
    return Boolean(teacher && cls && (Number(teacher.classId) === Number(cls.id) || Number(cls.teacherId) === Number(teacher.id)));
  }
  return false;
}


function cleanFilePart(value, fallback='Report') {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback;
}

function imageSource(value) {
  if (!value || /\/undefined|\/null/i.test(String(value))) return null;
  const text = String(value);
  const match = text.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
  if (match) { try { return Buffer.from(match[1], 'base64'); } catch (_) { return null; } }
  const rel = text.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  const candidates = [path.join(process.cwd(), rel), path.join(process.cwd(), 'uploads', path.basename(rel)), path.join(__dirname, '..', '..', rel)];
  return candidates.find(file => { try { return fs.statSync(file).isFile(); } catch (_) { return false; } }) || null;
}

function drawImageSafe(doc, source, x, y, options) {
  const resolved = imageSource(source);
  if (!resolved) return false;
  try { doc.image(resolved, x, y, options); return true; } catch (_) { return false; }
}


async function streamReportPdf(res, report) {
  const snap = report.snapshot || {};
  const student = snap.student || {};
  const school = snap.school || {};
  const subjects = Array.isArray(snap.subjects) ? snap.subjects : [];
  const signatures = snap.signatures || {};
  const filename = `${cleanFilePart(student.name,'Student')}_Report_Card_${cleanFilePart(report.term,'Term')}_${report.year}_v${report.version}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  const doc = new PDFDocument({ size:'A4', margin:24, autoFirstPage:true, info:{ Title:filename, Author:school.name || 'Shule AI' } });
  doc.pipe(res);
  const pageW = doc.page.width, pageH = doc.page.height, contentW = pageW - 48;
  const primary = school.branding?.primaryColor || '#083A85';
  const accent = school.branding?.accentColor || '#11B5B1';
  const logo = school.logo || school.branding?.logoUrl || null;
  // Watermark: official logo if available; otherwise a neutral Shule AI text mark.
  let drewWatermark = false;
  if (logo) {
    doc.save().opacity(0.055);
    drewWatermark = drawImageSafe(doc, logo, pageW/2 - 135, 220, { fit:[270,270], align:'center', valign:'center' });
    doc.restore();
  }
  if (!drewWatermark) {
    doc.save().opacity(0.055).fillColor(primary).font('Helvetica-Bold').fontSize(72).text('Shule AI', 0, 330, { align:'center' }).restore();
  }
  // Header
  if (!drawImageSafe(doc, logo, 28, 26, { fit:[54,54] })) {
    doc.roundedRect(30,28,50,50,10).fill(primary).fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('SA',30,45,{width:50,align:'center'});
  }
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(18).text(school.name || 'Shule AI School', 88, 28, { width:pageW-176, align:'center' });
  doc.fillColor(accent).fontSize(12).text('END TERM REPORT CARD', 88, 50, { width:pageW-176, align:'center' });
  doc.fillColor('#475569').font('Helvetica').fontSize(8).text(`${String(snap.curriculum || report.curriculum || 'CBC / CBE').toUpperCase()} • ${report.term} ${report.year} • Version ${report.version}`,88,67,{width:pageW-176,align:'center'});
  doc.moveTo(24,86).lineTo(pageW-24,86).lineWidth(2).strokeColor(primary).stroke();
  // Student identity
  const topY=98;
  doc.roundedRect(24,topY,contentW,58,8).fill('#f8fafc').strokeColor('#dbe5f0').stroke();
  const photoX=pageW-86;
  if (!drawImageSafe(doc, student.photo, photoX, topY+8, { fit:[46,46] })) {
    doc.circle(photoX+23,topY+31,23).fill('#e2e8f0').fillColor(primary).font('Helvetica-Bold').fontSize(13).text(String(student.name || 'S').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),photoX,topY+25,{width:46,align:'center'});
  }
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(student.name || 'Student',36,topY+10,{width:pageW-135});
  doc.font('Helvetica').fontSize(8).fillColor('#475569');
  const identity=[student.elimuid?`Elimu ID: ${student.elimuid}`:null,`Class: ${student.className || student.grade || '—'}`,snap.class?.stream?`Stream: ${snap.class.stream}`:null,student.gender?`Gender: ${student.gender}`:null].filter(Boolean);
  identity.forEach((line,i)=>doc.text(line,36,topY+27+i*12,{width:pageW-145}));
  // Assessment table
  let y=168;
  const selected = Array.isArray(snap.assessmentSettings) && snap.assessmentSettings.length ? snap.assessmentSettings.filter(x=>x.showOnReport!==false).sort((a,b)=>(a.displayOrder||0)-(b.displayOrder||0)).slice(0,5) : [
    {label:'CAT 1'}, {label:'CAT 2'}, {label:'Midterm'}, {label:'End Term'}, {label:'SBA/Project'}
  ];
  const widths=[22,126,42,42,48,48,54,42,36,94];
  const xs=[]; widths.reduce((acc,w)=>{xs.push(acc);return acc+w;},24);
  const tableW=widths.reduce((a,b)=>a+b,0);
  doc.rect(24,y,tableW,22).fill(primary);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.8);
  ['No','Learning Area',...selected.map(x=>x.label||x.assessmentName||x.key),'Final','Grade','Remark'].slice(0,10).forEach((h,i)=>doc.text(String(h),xs[i]+2,y+7,{width:widths[i]-4,align:i>1?'center':'left'}));
  y+=22;
  const maxRows=Math.min(subjects.length || 1, 12);
  for(let i=0;i<maxRows;i++){
    const row=subjects[i]||{}; const rowH=24;
    if(i%2===0) doc.rect(24,y,tableW,rowH).fill('#f8fafc');
    doc.strokeColor('#dbe5f0').lineWidth(.5).rect(24,y,tableW,rowH).stroke();
    const comps = Array.isArray(row.components) ? row.components : (Array.isArray(row.assessments) ? row.assessments : []);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(7.3);
    doc.text(String(i+1),xs[0]+2,y+7,{width:widths[0]-4,align:'center'});
    doc.font('Helvetica-Bold').text(String(row.subject||row.name||'Learning Area').slice(0,30),xs[1]+2,y+5,{width:widths[1]-4,height:16,ellipsis:true});
    selected.forEach((col,idx)=>{ const item=comps[idx]; const val=item?.score ?? item?.mark ?? item ?? ''; doc.font('Helvetica').text(String(val),xs[2+idx]+2,y+7,{width:widths[2+idx]-4,align:'center'}); });
    const finalIndex=2+selected.length;
    doc.font('Helvetica-Bold').text(row.average==null?(row.finalScore??row.score??'—'):`${row.average}`,xs[finalIndex]+2,y+7,{width:widths[finalIndex]-4,align:'center'});
    doc.text(row.grade||row.meanGrade||'—',xs[finalIndex+1]+2,y+7,{width:widths[finalIndex+1]-4,align:'center'});
    doc.font('Helvetica').fontSize(6.7).text(String(row.remark||row.teacherRemark||row.status||'').slice(0,56),xs[finalIndex+2]+2,y+5,{width:widths[finalIndex+2]-4,height:16});
    y+=rowH;
  }
  y+=8;
  // Summary cards
  const cardW=(contentW-18)/4;
  const summary=[['Overall Mean',`${snap.overallAverage ?? '—'}%`],['Overall Grade',snap.overallGrade||'—'],['Attendance',`${snap.attendance?.rate ?? '—'}%`],['Counted Subjects',snap.countedSubjects ?? subjects.length ?? '—']];
  summary.forEach((c,i)=>{const x=24+i*(cardW+6);doc.roundedRect(x,y,cardW,38,6).fill(i%2? '#eef9f9':'#f1f5f9');doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(c[0],x+6,y+7,{width:cardW-12,align:'center'});doc.fillColor(primary).font('Helvetica-Bold').fontSize(13).text(String(c[1]),x+6,y+20,{width:cardW-12,align:'center'});});
  y+=48;
  // Insights, attendance, account
  const leftW=contentW*.47, midW=contentW*.24, rightW=contentW-leftW-midW-12;
  function panel(x,w,title,body,color=primary){doc.roundedRect(x,y,w,86,6).strokeColor('#dbe5f0').stroke();doc.rect(x,y,w,18).fill(color);doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5).text(title,x+6,y+6,{width:w-12});doc.fillColor('#0f172a').font('Helvetica').fontSize(7.3).text(body,x+7,y+25,{width:w-14,height:54});}
  panel(24,leftW,'COMPETENCY INSIGHTS',`Strengths: ${snap.insights?.strengths || 'Derived from real learning evidence.'}\nNeeds support: ${snap.insights?.support || 'Teacher support areas appear here.'}\nNext steps: ${snap.insights?.nextSteps || 'Parent-friendly next steps appear here.'}`);
  panel(30+leftW,midW,'ATTENDANCE',`Present: ${snap.attendance?.present ?? '—'}\nAbsent: ${snap.attendance?.absent ?? '—'}\nLate: ${snap.attendance?.late ?? '—'}\nRate: ${snap.attendance?.rate ?? '—'}%`,accent);
  panel(36+leftW+midW,rightW,'ACCOUNT SUMMARY',snap.feeBalance==null?'Fee balance is hidden by school settings.':`Fee balance: KES ${Number(snap.feeBalance||0).toLocaleString('en-KE')}\nShown according to school report settings.`);
  y+=100;
  // Comments/signatures
  const half=(contentW-16)/2;
  function commentBox(x,title,text,sigTitle,sig){doc.fillColor(primary).font('Helvetica-Bold').fontSize(8).text(title,x,y,{width:half});doc.roundedRect(x,y+14,half,62,6).strokeColor('#dbe5f0').stroke();doc.fillColor('#0f172a').font('Helvetica').fontSize(7.5).text(String(text||'').slice(0,180),x+7,y+23,{width:half-14,height:26});drawImageSafe(doc,sig?.image,x+10,y+48,{fit:[100,24]});doc.moveTo(x+7,y+60).lineTo(x+half-7,y+60).strokeColor('#64748b').stroke();doc.fillColor('#64748b').fontSize(7).text(sig?.name||sigTitle,x+7,y+64,{width:half-14,align:'center'});}
  commentBox(24,'CLASS TEACHER COMMENT',snap.comments?.classTeacher||snap.comments?.general||'Teacher comment appears here.','Class Teacher',signatures.classTeacher||{});
  commentBox(40+half,'HEAD TEACHER COMMENT',snap.comments?.headteacher||'Head teacher comment appears here.','Head Teacher',signatures.headteacher||{});
  doc.fillColor('#64748b').fontSize(7).text(`Published ${report.publishedAt ? new Date(report.publishedAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}) : ''} • Immutable report ID ${report.id} • Generated with Shule AI`,24,pageH-34,{width:contentW,align:'center'});
  doc.end();
}

async function findReadableReport(req, where) {
  const report = await ReportSnapshot.findOne({ where:{ ...where, schoolCode:code(req) }, order:[['year','DESC'],['publishedAt','DESC'],['version','DESC']] });
  return (await canRead(req,report)) ? report : null;
}

exports.list = async (req,res) => {
  try {
    const where = { schoolCode:code(req), status:{ [Op.in]:['published','archived'] } };
    if (req.query.studentId) where.studentId = Number(req.query.studentId);
    if (req.query.term) where.term = req.query.term;
    if (req.query.year) where.year = Number(req.query.year);
    if (req.user.role === 'student') where.studentId = (await studentForUser(req.user.id))?.id || -1;
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ where:{ userId:req.user.id } });
      const links = parent ? await StudentParent.findAll({ where:{ parentId:parent.id } }) : [];
      where.studentId = { [Op.in]:links.map(x=>x.studentId) };
    }
    if (req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ where:{ userId:req.user.id } });
      const classes = teacher ? await Class.findAll({ where:{ schoolCode:code(req), [Op.or]:[{ teacherId:teacher.id }, { id:teacher.classId || -1 }] }, attributes:['id'] }) : [];
      where.classId = { [Op.in]:classes.map(c=>c.id) };
    }
    const rows = await snapshotService.listHistory(where, { limit:500, attributes:{ exclude:['sourceRecordIds'] } });
    res.json({ success:true, data:rows });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getOne = async (req,res) => {
  try {
    const row = await ReportSnapshot.findOne({ where:{ id:Number(req.params.id), schoolCode:code(req) } });
    if (!(await canRead(req,row))) return res.status(403).json({ success:false, message:'You are not allowed to view this report card' });
    res.json({ success:true, data:row });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.downloadPdf = async (req,res) => {
  try {
    const report = await findReadableReport(req, { id:Number(req.params.id), status:{ [Op.in]:['published','archived'] } });
    if (!report) return res.status(403).json({ success:false, message:'You are not allowed to download this report card' });
    await streamReportPdf(res,report);
  } catch (error) { if (!res.headersSent) res.status(500).json({ success:false, message:error.message }); else res.end(); }
};

exports.downloadLatestPdf = async (req,res) => {
  try {
    const report = await findReadableReport(req, { studentId:Number(req.params.studentId), status:'published', isCurrent:true });
    if (!report) return res.status(404).json({ success:false, message:'This report card has not yet been published by the school.' });
    await streamReportPdf(res,report);
  } catch (error) { if (!res.headersSent) res.status(500).json({ success:false, message:error.message }); else res.end(); }
};

exports.correct = async (req,res) => {
  try {
    if (!['admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success:false, message:'Only an authorised school administrator can correct a published report card' });
    const previous = await ReportSnapshot.findOne({ where:{ id:Number(req.params.id), schoolCode:code(req), isCurrent:true } });
    if (!previous) return res.status(404).json({ success:false, message:'Current report card version not found' });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success:false, message:'A correction reason is required' });
    const result = await snapshotService.createPublishedVersion({ ...previous.toJSON(), snapshot:req.body.snapshot || previous.snapshot, correctionReason:reason, publishedBy:req.user.id, generatedBy:req.user.id, publishedAt:new Date(), assessmentKey:previous.assessmentKey });
    res.status(201).json({ success:true, message:`Report card version ${result.row.version} created. Version ${previous.version} remains in history.`, data:result.row });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.share = async (req,res) => {
  try {
    const report = await ReportSnapshot.findOne({ where:{ id:Number(req.params.id), schoolCode:code(req), status:'published', isCurrent:true } });
    if (!(await canRead(req,report)) || req.user.role === 'student') return res.status(403).json({ success:false, message:'You are not allowed to share this report card' });
    const channel = String(req.body.channel || 'secure_link');
    if (!['secure_link','email','school_chat'].includes(channel)) return res.status(400).json({ success:false, message:'Unsupported report sharing channel' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(req.body.expiresHours || 72),1),168) * 3600000);
    const share = await ReportShare.create({ schoolCode:code(req), reportSnapshotId:report.id, studentId:report.studentId, recipientUserId:req.body.recipientUserId || null, channel, recipientAddress:req.body.recipientAddress || null, tokenHash:crypto.createHash('sha256').update(rawToken).digest('hex'), expiresAt, status:'sent', sentBy:req.user.id, sentAt:new Date(), metadata:{ deliveryNote: channel === 'secure_link' ? 'Expiring secure link created' : 'Delivery queued for configured provider' } });
    res.status(201).json({ success:true, message:'Report sharing record created and logged.', data:{ shareId:share.id, token:rawToken, expiresAt, channel } });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.openShared = async (req,res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.params.token || '')).digest('hex');
    const share = await ReportShare.findOne({ where:{ tokenHash, status:'sent', expiresAt:{ [Op.gt]:new Date() } } });
    if (!share) return res.status(404).json({ success:false, message:'This secure report link is invalid or has expired' });
    const report = await ReportSnapshot.findOne({ where:{ id:share.reportSnapshotId, schoolCode:share.schoolCode, status:{ [Op.in]:['published','archived'] } } });
    if (!report) return res.status(404).json({ success:false, message:'Report card not found' });
    await share.update({ status:'delivered', deliveredAt:new Date() });
    await streamReportPdf(res, report);
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
