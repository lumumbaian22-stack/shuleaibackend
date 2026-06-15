const { Op } = require('sequelize');
const {
  AcademicRecord, ReportSnapshot, Student, User, AuditLog,
  School, Class, Parent, StudentParent, Teacher, Attendance, TeacherSubjectAssignment
} = require('../models');
const curriculumEngine = require('../services/curriculumStructureEngine');
const selectionsService = require('../services/studentSubjectSelectionService');
const snapshotService = require('../services/reportSnapshotService');
const { getGradeFromScore } = require('../utils/curriculumHelper');

function schoolCode(req) { return req.user?.schoolCode; }
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function gradingLevel(cls, school) { return cls?.levelCode || cls?.grade || cls?.name || school?.settings?.schoolLevel || school?.schoolStructure || 'primary'; }
function gradeFor(score, school, cls) {
  if (score === null || score === undefined) return null;
  return getGradeFromScore(Number(score), school?.system || 'cbc', gradingLevel(cls, school), school?.settings?.gradingScale || null);
}

function defaultReportLogo() { return '/assets/logo.png'; }
function logoForSchool(school) { return school?.settings?.branding?.logoDataUrl || school?.settings?.branding?.logoUrl || school?.settings?.branding?.logo || school?.settings?.logo || school?.reportCardSettings?.logo || defaultReportLogo(); }
function reportAssessmentSettings(school) { const raw = school?.settings?.curriculumEngine?.assessmentSettings || school?.settings?.reportCardSettings?.assessmentSettings || school?.reportCardSettings?.assessmentSettings || []; const base = Array.isArray(raw) && raw.length ? raw : [{key:'opener',label:'Opener Exam',assessmentType:'Opener',type:'Opener',showOnReport:true,countInFinal:false,weight:0,displayOrder:1},{key:'cat1',label:'CAT 1',assessmentType:'CAT 1',type:'CAT',showOnReport:true,countInFinal:true,weight:10,displayOrder:2},{key:'cat2',label:'CAT 2',assessmentType:'CAT 2',type:'CAT',showOnReport:true,countInFinal:true,weight:10,displayOrder:3},{key:'midterm',label:'Midterm',assessmentType:'Midterm',type:'Midterm',showOnReport:true,countInFinal:true,weight:20,displayOrder:4},{key:'endterm',label:'End Term',assessmentType:'End Term',type:'EndTerm',showOnReport:true,countInFinal:true,weight:50,displayOrder:5},{key:'sba',label:'SBA / Project',assessmentType:'SBA',type:'SBA',showOnReport:true,countInFinal:true,weight:10,displayOrder:6}]; return base.filter(x=>x && x.isActive !== false).map((x,i)=>({ ...x, label:x.label||x.displayName||x.name||x.assessmentType||`Assessment ${i+1}`, assessmentType:x.assessmentType||x.type||x.label||'Custom', weight:Number(x.weight ?? x.weightPercent ?? 0), displayOrder:Number(x.displayOrder||i+1) })); }
function normAssess(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function recordMatchesAssessment(record, setting){ const keys=[record.assessmentType,record.assessmentName,record.testType,record.examType,record.type].map(normAssess); return keys.includes(normAssess(setting.assessmentType))||keys.includes(normAssess(setting.label))||keys.includes(normAssess(setting.key)); }

const REPORT_RECORD_ASSESSMENT_ENUMS = new Set(['test','exam','assignment','project','quiz']);
function enumReportAssessmentType(value){const raw=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');return REPORT_RECORD_ASSESSMENT_ENUMS.has(raw)?raw:null;}
function recordMatchesRequestedAssessment(record, requested){
  const wanted=normAssess(requested);
  if(!wanted) return true;
  const keys=[record.assessmentType,record.assessmentName,record.testType,record.examType,record.type].map(normAssess);
  if(keys.includes(wanted)) return true;
  const aliases={cat:['cat','cat1','cat2','continuousassessment','continuousassessmenttest'],midterm:['midterm','midtermexam'],endterm:['endterm','endtermexam','finalexam','exam'],sba:['sba','schoolbasedassessment'],project:['project','sbaproject'],practical:['practical','practicalassessment']};
  const accepted=aliases[wanted]||[];
  return keys.some(k=>accepted.includes(k) || k.includes(wanted));
}


async function studentForUser(userId) {
  return (Student.unscoped ? Student.unscoped() : Student).findOne({ where:{ userId } });
}

async function teacherOwnsClass(req, classId) {
  const teacher = await Teacher.findOne({ where:{ userId:req.user.id } });
  if (!teacher || !classId) return false;
  if (Number(teacher.classId) === Number(classId)) return true;
  const cls = await Class.findOne({ where:{ id:Number(classId), schoolCode:schoolCode(req), [Op.or]:[{ teacherId:teacher.id }, { classTeacherId:teacher.id }] } }).catch(()=>null);
  if (cls) return true;
  const assignment = await TeacherSubjectAssignment.findOne({ where:{ teacherId:teacher.id, classId:Number(classId), isClassTeacher:true } }).catch(()=>null);
  return !!assignment;
}

async function canRead(req, report) {
  if (!report || String(report.schoolCode) !== String(schoolCode(req))) return false;
  if (['admin','super_admin'].includes(req.user.role)) return true;
  if (req.user.role === 'student') return Number((await studentForUser(req.user.id))?.id) === Number(report.studentId);
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ where:{ userId:req.user.id } });
    return Boolean(parent && await StudentParent.findOne({ where:{ parentId:parent.id, studentId:report.studentId } }));
  }
  if (req.user.role === 'teacher') return teacherOwnsClass(req, report.classId);
  return false;
}

async function buildSnapshot({ studentId, schoolCode:code, term, year, assessmentType, assessmentName }) {
  const student = await (Student.unscoped ? Student.unscoped() : Student).findOne({
    where:{ id:Number(studentId) },
    include:[{ model:User, required:true, where:{ schoolCode:code, role:'student' }, attributes:['id','name','email','schoolCode','profileImage'] }]
  });
  if (!student) { const error = new Error('Student not found'); error.status = 404; throw error; }
  const school = await School.findOne({ where:{ schoolId:code } });
  const cls = student.classId
    ? await Class.findOne({ where:{ id:student.classId, schoolCode:code } })
    : await Class.findOne({ where:{ schoolCode:code, [Op.or]:[{ name:student.grade }, { grade:student.grade }] } });
  const where = { studentId:student.id, schoolCode:code, term, year:Number(year) };
  if (assessmentType) { const safeType = enumReportAssessmentType(assessmentType); if (safeType) where.assessmentType = safeType; }
  if (assessmentName) where.assessmentName = assessmentName;
  let records = await AcademicRecord.unscoped().findAll({ where, order:[['subject','ASC'],['assessmentName','ASC'],['date','ASC']] });
  const assessmentSettings = reportAssessmentSettings(school).filter(x => x.showOnReport !== false).sort((a,b)=>Number(a.displayOrder||0)-Number(b.displayOrder||0));
  const countedSettings = assessmentSettings.filter(x => x.countInFinal !== false);
  if (assessmentType) records = records.filter(record => recordMatchesRequestedAssessment(record, assessmentType));
  if (!assessmentType && !assessmentName && assessmentSettings.length) {
    records = records.filter(record => assessmentSettings.some(setting => recordMatchesAssessment(record, setting)));
  }
  const selections = cls ? await selectionsService.listStudentSubjectSelections({ schoolCode:code, studentId:student.id, classId:cls.id }).catch(() => []) : [];
  const reportRows = school && cls ? curriculumEngine.buildSubjectRowsForReport({ school, classItem:cls, student, records, studentSubjectSelections:selections }) : [];
  const summary = reportRows.length ? curriculumEngine.summarizeReportRows(reportRows) : null;
  const grouped = new Map();
  records.forEach(record => { const raw=record.toJSON(); if(!grouped.has(raw.subject))grouped.set(raw.subject,[]);grouped.get(raw.subject).push(raw); });
  const fallbackSubjects = [...grouped].map(([subject,rows]) => {
    const valid=rows.map(row=>numberOrNull(row.score)).filter(score=>score!==null);
    const average=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):null;
    return { subject, average, grade:gradeFor(average,school,cls), status:average===null?'Pending':'Completed', counted:average!==null, assessments:rows };
  });
  const subjects = reportRows.length ? reportRows.map(row => ({
    subject:row.subject,
    average:row.score,
    grade:row.score == null ? null : gradeFor(row.score,school,cls),
    status:row.status,
    counted:row.counted,
    assessments:row.assessments || []
  })) : fallbackSubjects;
  const overallAverage = reportRows.length
    ? summary.average
    : (subjects.filter(row=>row.counted&&row.average!==null).length ? Math.round(subjects.filter(row=>row.counted&&row.average!==null).reduce((sum,row)=>sum+Number(row.average),0)/subjects.filter(row=>row.counted&&row.average!==null).length) : null);
  const attendanceRows = await Attendance.findAll({ where:{ schoolCode:code, studentId:student.id }, attributes:['status'] }).catch(()=>[]);
  const attendance = { present:0, absent:0, late:0, total:attendanceRows.length, rate:0 };
  attendanceRows.forEach(row => { if(Object.prototype.hasOwnProperty.call(attendance,row.status))attendance[row.status]++; });
  attendance.rate = attendance.total ? Math.round((attendance.present / attendance.total) * 1000) / 10 : 0;
  const snapshot = {
    student:{ id:student.id, userId:student.userId, name:student.User?.name, photo:student.User?.profileImage || student.profileImage || null, dateOfBirth:student.dateOfBirth, elimuid:student.elimuid, grade:student.grade, className:cls?.name || student.grade },
    school:{ name:school?.name || 'School', logo:logoForSchool(school), watermarkLogo:logoForSchool(school), branding:school?.settings?.branding || {}, usesFallbackLogo:!logoForSchool(school) || logoForSchool(school) === defaultReportLogo() },
    class:cls ? { id:cls.id, name:cls.name, grade:cls.grade, stream:cls.stream, levelCode:cls.levelCode } : null,
    term, year:Number(year), curriculum:school?.system || student.curriculum || null,
    assessmentType:assessmentType || null, assessmentName:assessmentName || null, assessmentSettings, countedAssessments:countedSettings,
    subjects, totalMarks:summary?.totalMarks ?? subjects.filter(row=>row.counted&&row.average!==null).reduce((sum,row)=>sum+Number(row.average),0),
    countedSubjects:summary?.countedSubjects ?? subjects.filter(row=>row.counted&&row.average!==null).length,
    pendingSubjects:summary?.pendingSubjects ?? subjects.filter(row=>row.average===null&&row.status!=='Not Taken').length,
    notTakenSubjects:summary?.notTakenSubjects ?? subjects.filter(row=>row.counted===false).length,
    overallAverage, overallGrade:gradeFor(overallAverage,school,cls), attendance,
    generatedAt:new Date().toISOString(),
    calculationRule:'Only valid completed subjects the learner is taking are counted. Pending, exempted and Not Taken subjects remain visible but are excluded from the mean.'
  };
  return { student, school, cls, records, snapshot };
}

exports.generateReport = async (req,res) => {
  try {
    const { studentId, term='Term 1', year=new Date().getFullYear(), publish=false, assessmentType=null, assessmentName=null } = req.body;
    if (!studentId) return res.status(400).json({ success:false, message:'studentId is required' });
    const built = await buildSnapshot({ studentId, schoolCode:schoolCode(req), term, year, assessmentType, assessmentName });
    if (req.user.role === 'teacher' && !(await teacherOwnsClass(req,built.cls?.id))) return res.status(403).json({ success:false, message:'Only the assigned class teacher can generate or publish this report card' });
    if (!publish) return res.json({ success:true, message:'Draft preview generated. It is visible only to authorised school staff until publication.', data:{ status:'draft', snapshot:built.snapshot } });
    const result = await snapshotService.createPublishedVersion({
      schoolCode:schoolCode(req), studentId:Number(studentId), classId:built.cls?.id || null,
      term, year:Number(year), curriculum:built.snapshot.curriculum, reportType:'academic',
      assessmentType, assessmentName, snapshot:built.snapshot, sourceRecordIds:built.records.map(record=>record.id),
      generatedBy:req.user.id, publishedBy:req.user.id, publishedAt:new Date(),
      metadata:{ engine:'v1506_dynamic_assessment_report_card', assessmentSettings:built.snapshot.assessmentSettings, countedAssessments:built.snapshot.countedAssessments }
    });
    await AuditLog.create({ schoolCode:schoolCode(req), actorUserId:req.user.id, actorRole:req.user.role, module:'reports', action:'report_published', entityType:'ReportSnapshot', entityId:String(result.row.id), after:{ version:result.row.version, studentId:Number(studentId), term, year:Number(year) } }).catch(()=>null);
    res.status(result.created?201:200).json({ success:true, message:result.unchanged?'The identical published report already exists.':'Report card published as an immutable historical version.', data:result.row });
  } catch (error) { res.status(error.status||500).json({ success:false, message:error.message }); }
};

exports.listReports = async (req,res) => {
  try {
    const where={ schoolCode:schoolCode(req), status:{ [Op.in]:['published','archived'] } };
    if(req.query.studentId)where.studentId=Number(req.query.studentId);if(req.query.term)where.term=req.query.term;if(req.query.year)where.year=Number(req.query.year);
    if(req.user.role==='student')where.studentId=(await studentForUser(req.user.id))?.id||-1;
    if(req.user.role==='parent'){const parent=await Parent.findOne({where:{userId:req.user.id}});const links=parent?await StudentParent.findAll({where:{parentId:parent.id}}):[];where.studentId={ [Op.in]:links.map(link=>link.studentId) };}
    if(req.user.role==='teacher'){const teacher=await Teacher.findOne({where:{userId:req.user.id}});const classes=teacher?await Class.findAll({where:{schoolCode:schoolCode(req),[Op.or]:[{teacherId:teacher.id},{id:teacher.classId||-1}]},attributes:['id']}):[];where.classId={ [Op.in]:classes.map(cls=>cls.id) };}
    const rows=await ReportSnapshot.findAll({where,order:[['year','DESC'],['term','DESC'],['version','DESC']],limit:500,attributes:{exclude:['sourceRecordIds']}});
    res.json({success:true,data:rows});
  } catch(error){res.status(500).json({success:false,message:error.message});}
};

exports.getReport = async (req,res) => {
  try { const row=await ReportSnapshot.findOne({where:{id:Number(req.params.id),schoolCode:schoolCode(req)}});if(!(await canRead(req,row)))return res.status(403).json({success:false,message:'You are not allowed to view this report card'});res.json({success:true,data:row}); }
  catch(error){res.status(500).json({success:false,message:error.message});}
};
