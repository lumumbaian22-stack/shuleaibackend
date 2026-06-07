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
  const doc = new PDFDocument({ size:'A4', margin:30, autoFirstPage:true, info:{ Title:filename, Author:school.name || 'Shule AI' } });
  doc.pipe(res);
  const primary = school.branding?.primaryColor || '#083A85';
  const accent = school.branding?.accentColor || '#11B5B1';
  const pageW = doc.page.width, contentW = pageW - 60;

  // Light watermark, safely skipped if the saved image is no longer locally available.
  if (school.logo) {
    doc.save().opacity(0.055);
    drawImageSafe(doc, school.logo, pageW/2 - 130, 220, { fit:[260,260], align:'center', valign:'center' });
    doc.restore().opacity(1);
  }
  if (!drawImageSafe(doc, school.logo, 32, 30, { fit:[58,58] })) {
    doc.roundedRect(34,32,54,54,10).fill(primary).fillColor('#ffffff').fontSize(20).text('SA',34,48,{width:54,align:'center'});
  }
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(17).text(school.name || 'Shule AI School', 98, 34, { width:contentW-100, align:'center' });
  doc.fillColor('#172033').fontSize(12).text('OFFICIAL STUDENT REPORT CARD', 98, 57, { width:contentW-100, align:'center' });
  doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`${String(snap.curriculum || report.curriculum || '').toUpperCase()} • ${report.term} ${report.year} • Version ${report.version}`,98,75,{width:contentW-100,align:'center'});
  doc.moveTo(30,94).lineTo(pageW-30,94).lineWidth(2).strokeColor(primary).stroke();

  const photoX = pageW - 92;
  if (!drawImageSafe(doc, student.photo, photoX, 105, { fit:[58,58], align:'center', valign:'center' })) {
    doc.circle(photoX+29,134,29).fill('#e2e8f0').fillColor(primary).font('Helvetica-Bold').fontSize(16).text(String(student.name || 'S').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),photoX,127,{width:58,align:'center'});
  }
  doc.fillColor('#172033').font('Helvetica-Bold').fontSize(11).text(student.name || 'Student',32,107,{width:pageW-140});
  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  const identity = [student.elimuid ? `ELIMU ID: ${student.elimuid}` : null, `Class: ${student.className || student.grade || '—'}`, snap.class?.stream ? `Stream: ${snap.class.stream}` : null].filter(Boolean);
  identity.forEach((line,i)=>doc.text(line,32,126+i*14,{width:pageW-145}));
  doc.fillColor('#172033').font('Helvetica-Bold').fontSize(10).text(`Mean: ${snap.overallAverage ?? '—'}%`,pageW-210,173,{width:85,align:'center'});
  doc.text(`Grade: ${snap.overallGrade || '—'}`,pageW-120,173,{width:75,align:'center'});

  let y=197;
  const col={ subject:32, score:292, grade:355, status:420, width:143 };
  doc.rect(30,y,contentW,22).fill(primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
  doc.text('SUBJECT',col.subject,y+7,{width:250}); doc.text('SCORE',col.score,y+7,{width:55,align:'center'}); doc.text('GRADE',col.grade,y+7,{width:55,align:'center'}); doc.text('STATUS',col.status,y+7,{width:col.width,align:'center'});
  y+=22;
  const maxRows=Math.min(subjects.length,18);
  for(let i=0;i<maxRows;i++){
    const row=subjects[i]||{}; const rowH=19;
    if(i%2===0) doc.rect(30,y,contentW,rowH).fill('#f8fafc');
    doc.strokeColor('#e2e8f0').lineWidth(.5).moveTo(30,y+rowH).lineTo(pageW-30,y+rowH).stroke();
    doc.fillColor('#172033').font('Helvetica').fontSize(8.2).text(String(row.subject||'Subject').slice(0,46),col.subject,y+5,{width:250,ellipsis:true});
    doc.text(row.average==null?'—':`${row.average}%`,col.score,y+5,{width:55,align:'center'});
    doc.font('Helvetica-Bold').text(row.grade||'—',col.grade,y+5,{width:55,align:'center'});
    doc.font('Helvetica').text(row.counted===false?(row.status||'Not counted'):(row.status||'Counted'),col.status,y+5,{width:col.width,align:'center'});
    y+=rowH;
  }
  if(subjects.length>maxRows){doc.fillColor('#64748b').fontSize(7.5).text(`+ ${subjects.length-maxRows} additional subject(s) retained in the immutable digital snapshot.`,32,y+3);y+=14;}

  const attendance=snap.attendance||{};
  y+=10;
  doc.roundedRect(30,y,contentW,47,8).fill('#f1f5f9');
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(9).text('RESULT SUMMARY',42,y+8);
  doc.fillColor('#172033').font('Helvetica').fontSize(8.5).text(`Total marks: ${snap.totalMarks ?? '—'}   •   Counted subjects: ${snap.countedSubjects ?? '—'}   •   Pending: ${snap.pendingSubjects ?? 0}   •   Not taken/exempted: ${snap.notTakenSubjects ?? 0}`,42,y+23,{width:contentW-24});
  doc.text(`Attendance: ${attendance.rate ?? 0}% (${attendance.present ?? 0} present, ${attendance.absent ?? 0} absent, ${attendance.late ?? 0} late)${snap.feeBalance==null?'':`   •   Fee balance: KES ${Number(snap.feeBalance).toLocaleString('en-KE')}`}`,42,y+35,{width:contentW-24});
  y+=58;

  const comment=snap.comments?.classTeacher||snap.comments?.general;
  if(comment){doc.fillColor(primary).font('Helvetica-Bold').fontSize(9).text('CLASS TEACHER COMMENT',32,y);doc.fillColor('#172033').font('Helvetica').fontSize(8).text(String(comment),32,y+13,{width:contentW,height:28,ellipsis:true});y+=44;}

  const signatureY=Math.min(Math.max(y+8, doc.page.height-132), doc.page.height-132);
  const sigs=[['Class Teacher',signatures.classTeacher],['Headteacher / Principal',signatures.headteacher]];
  sigs.forEach((entry,index)=>{const x=index===0?45:pageW/2+18;const width=210;const info=entry[1]||{};drawImageSafe(doc,info.image,x,signatureY-35,{fit:[145,32]});doc.strokeColor('#64748b').lineWidth(.7).moveTo(x,signatureY).lineTo(x+width,signatureY).stroke();doc.fillColor('#172033').font('Helvetica').fontSize(8).text(info.name||'',x,signatureY+4,{width});doc.fillColor('#64748b').text(entry[0],x,signatureY+15,{width});});
  doc.fillColor('#64748b').fontSize(7).text(`Published ${report.publishedAt ? new Date(report.publishedAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}) : ''} • Immutable report ID ${report.id} • ${snap.calculationRule || 'Only counted subjects are included in the mean.'}`,30,doc.page.height-42,{width:contentW,align:'center'});
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
