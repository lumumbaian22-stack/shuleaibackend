const express = require('express');
const { generateTemporaryPassword } = require('../utils/passwords');
const { Op } = require('sequelize');
const { protect, authorize } = require('../middleware/auth');
const { User, Teacher, Student, Parent, Class, AcademicRecord, Attendance, Payment, Alert, SchoolCalendar, Timetable, School, ReportSnapshot } = require('../models');
const tutorController = require('../controllers/tutorController');
const { createBulkAlerts } = require('../services/notificationService');

const router = express.Router();
function ok(res, data = null, message = 'OK') { return res.json({ success: true, message, data }); }
function fail(res, status, message) { return res.status(status).json({ success: false, message }); }
function grade(score){ const s=Number(score||0); if(s>=80) return 'EE'; if(s>=60) return 'ME'; if(s>=40) return 'AE'; return 'BE'; }
function schoolCode(req){ return req.user?.schoolCode || req.body?.schoolCode || req.query?.schoolCode || null; }
function normalizeStatus(status){ if(status === 'paid') return 'completed'; return status || 'pending'; }
function normalizeGender(g){ const x=String(g||'other').toLowerCase(); return ['male','female','other'].includes(x) ? x : 'other'; }
async function currentStudent(req){ return Student.findOne({ where:{ userId:req.user.id }, include:[{model:User, attributes:['id','name','email','phone','schoolCode','role']}] }); }
async function currentTeacher(req){ return Teacher.findOne({ where:{ userId:req.user.id }, include:[{model:User, attributes:['id','name','email','phone','schoolCode','role']}] }); }
async function currentParent(req){ return Parent.findOne({ where:{ userId:req.user.id }, include:[{model:User, attributes:['id','name','email','phone','schoolCode','role']}] }); }
async function academicSummary(studentId, code){
  const records = await AcademicRecord.findAll({ where:{ studentId, schoolCode:code }, order:[['year','DESC'],['term','DESC'],['subject','ASC']] }).catch(()=>[]);
  const bySubject = {};
  for (const r of records) { bySubject[r.subject] = bySubject[r.subject] || []; bySubject[r.subject].push(r); }
  const subjects = Object.entries(bySubject).map(([subject, rows]) => {
    const avg = rows.length ? Math.round(rows.reduce((a,b)=>a+Number(b.score||0),0)/rows.length) : 0;
    return { subject, average: avg, grade: grade(avg), records: rows };
  });
  const overallAverage = subjects.length ? Math.round(subjects.reduce((a,b)=>a+b.average,0)/subjects.length) : null;
  return { records, subjects, overallAverage, overallGrade: overallAverage == null ? null : grade(overallAverage) };
}

// Public health alias: fixes /api/health 404 from console checks.
router.get('/health', (req, res) => ok(res, { uptime: process.uptime(), timestamp: new Date().toISOString() }, 'API healthy'));

router.use(protect);

router.get('/schools', authorize('super_admin'), async (req,res)=>{ try{ const rows=await School.findAll({limit:1000,order:[['createdAt','DESC']]}); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.post('/schools', authorize('super_admin'), async (req,res)=>{ try{ const row=await School.create({ name:req.body.name, schoolId:req.body.code || req.body.schoolId, system:String(req.body.curriculum||'cbc').toLowerCase(), address:{ location:req.body.location||'' }, contact:{ phone:req.body.phone||'', email:req.body.email||'' }, status:req.body.status||'active', isActive:req.body.isActive !== false, settings:{...(req.body.settings||{}), testRunId:req.body.testRunId||undefined}, createdBy:req.user.id }); return ok(res,row,'School created'); }catch(e){return fail(res,500,e.message);} });

// Generic aliases used by old test scripts / old frontend modules.
router.get('/students', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Student.findAll({ include:[{model:User, where:{...where, role:'student'}, attributes:['id','name','email','phone','schoolCode','role','isActive']}], limit:1000, order:[['createdAt','DESC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/teachers', authorize('admin','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Teacher.findAll({ include:[{model:User, where:{...where, role:'teacher'}, attributes:['id','name','email','phone','schoolCode','role','isActive']}], limit:1000, order:[['createdAt','DESC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/parents', authorize('admin','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Parent.findAll({ include:[{model:User, where:{...where, role:'parent'}, attributes:['id','name','email','phone','schoolCode','role','isActive']}], limit:1000, order:[['createdAt','DESC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/classes', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Class.findAll({ where, limit:1000, order:[['name','ASC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/attendance', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Attendance.findAll({ where, limit:1000, order:[['date','DESC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/marks', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await AcademicRecord.findAll({ where, limit:1000, order:[['createdAt','DESC']] }); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/reports', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const records = await AcademicRecord.findAll({ where, limit:1000, order:[['createdAt','DESC']] }); const snapshots = await ReportSnapshot.findAll({ where, limit:1000, order:[['updatedAt','DESC']] }).catch(()=>[]); return ok(res, { snapshots, records }); } catch(e){ return fail(res,500,e.message); }
});
router.get('/announcements', async (req,res)=>{
  try { const where={}; if(req.user.role !== 'super_admin') where.schoolCode = schoolCode(req); const rows = await Alert.findAll({ where, limit:100, order:[['createdAt','DESC']] }).catch(()=>[]); return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.post('/announcements', authorize('admin','super_admin'), async (req,res)=>{
  try {
    const code=schoolCode(req); const audience=String(req.body.audience||'all').toLowerCase();
    const where=req.user.role==='super_admin'&&!code?{isActive:true}:{schoolCode:code,isActive:true};
    if(audience!=='all'&&['admin','teacher','parent','student'].includes(audience)) where.role=audience;
    const users=await User.findAll({where,attributes:['id','role','schoolCode'],limit:5000});
    const title=req.body.title||'Announcement', message=req.body.message||'';
    const result=await createBulkAlerts(users.map(u=>({userId:u.id,role:u.role,type:'announcement',severity:'info',title,message,sourceType:'announcement',sourceLabel:'School announcement',dedupeKey:`compat-announcement:${code||'platform'}:${u.id}:${title}:${message}`,data:{schoolCode:u.schoolCode||code,scope:'user',createdBy:req.user.id}})));
    return ok(res,{count:result.count},'Announcement created');
  } catch(e){ return fail(res,500,e.message); }
});
router.get('/academic-calendar', async (req,res)=>{
  try { const rows = SchoolCalendar ? await SchoolCalendar.findAll({ where:{ schoolCode:schoolCode(req) }, limit:200, order:[['startDate','ASC']] }).catch(()=>[]) : []; return ok(res, rows); } catch(e){ return fail(res,500,e.message); }
});
router.get('/analytics', async (req,res)=>{
  try { const code = schoolCode(req); const [students,teachers,parents,attendance,marks,payments] = await Promise.all([
    User.count({where:{schoolCode:code,role:'student'}}).catch(()=>0), User.count({where:{schoolCode:code,role:'teacher'}}).catch(()=>0), User.count({where:{schoolCode:code,role:'parent'}}).catch(()=>0), Attendance.count({where:{schoolCode:code}}).catch(()=>0), AcademicRecord.count({where:{schoolCode:code}}).catch(()=>0), Payment.count({where:{schoolCode:code}}).catch(()=>0)
  ]); return ok(res,{ students, teachers, parents, attendance, marks, payments, timestamp:new Date().toISOString() }); } catch(e){ return fail(res,500,e.message); }
});

// Safe generic timetable: role-aware instead of admin-only 403.
router.get('/timetable', async (req,res)=>{
  try {
    if (req.user.role === 'student') {
      const s = await currentStudent(req); if(!s) return ok(res, [], 'No student profile');
      const rows = Timetable ? await Timetable.findAll({ where:{ schoolCode:schoolCode(req), [Op.or]:[{ classId:s.classId || null }, { grade:s.grade || null }] } }).catch(()=>[]) : [];
      return ok(res, rows);
    }
    if (req.user.role === 'teacher') {
      const t = await currentTeacher(req); if(!t) return ok(res, [], 'No teacher profile');
      const rows = Timetable ? await Timetable.findAll({ where:{ schoolCode:schoolCode(req), [Op.or]:[{ teacherId:t.id }, { classId:t.classId || null }] } }).catch(()=>[]) : [];
      return ok(res, rows);
    }
    const rows = Timetable ? await Timetable.findAll({ where:{ schoolCode:schoolCode(req) }, limit:500 }).catch(()=>[]) : [];
    return ok(res, rows);
  } catch(e){ return fail(res,500,e.message); }
});

// Minimal POST aliases for test/demo seeding. Keep testRunId in metadata/preferences for cleanup.
router.post('/classes', authorize('admin','super_admin'), async (req,res)=>{
  try { const row = await Class.create({ name:req.body.name || req.body.className || 'Test Class', grade:req.body.level || req.body.grade || req.body.name || 'Grade 1', stream:req.body.stream || null, schoolCode:schoolCode(req), settings:{ testRunId:req.body.testRunId || null, curriculum:req.body.curriculum || null } }); return ok(res,row,'Class created'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/teachers', authorize('admin','super_admin'), async (req,res)=>{
  try { const email=req.body.email || `teacher-${Date.now()}@test.local`; const user=await User.create({ name:`${req.body.firstName||'Test'} ${req.body.lastName||'Teacher'}`.trim(), email, phone:req.body.phone, password:req.body.password || generateTemporaryPassword(), role:'teacher', schoolCode:schoolCode(req), preferences:{testRunId:req.body.testRunId||null}, firstLogin:true, mustChangePassword:true, passwordIssuedAt:new Date() }); const row=await Teacher.create({ userId:user.id, classId:req.body.classId || null, subjects:req.body.subject ? [req.body.subject] : [], classTeacher:req.body.classTeacher ? 'yes' : null, approvalStatus:'approved' }); return ok(res,{...row.toJSON(), User:user.getPublicProfile?.() || user},'Teacher created'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/parents', authorize('admin','super_admin'), async (req,res)=>{
  try { const email=req.body.email || `parent-${Date.now()}@test.local`; const user=await User.create({ name:`${req.body.firstName||'Test'} ${req.body.lastName||'Parent'}`.trim(), email, phone:req.body.phone, password:req.body.password || generateTemporaryPassword(), role:'parent', schoolCode:schoolCode(req), preferences:{testRunId:req.body.testRunId||null}, firstLogin:true, mustChangePassword:true, passwordIssuedAt:new Date() }); const row=await Parent.create({ userId:user.id, relationship:req.body.relationship || 'guardian' }); return ok(res,{...row.toJSON(), User:user.getPublicProfile?.() || user},'Parent created'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/students', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const email=req.body.email || `${(req.body.admissionNumber||Date.now()).toString().toLowerCase()}@student.test.local`; const user=await User.create({ name:`${req.body.firstName||'Test'} ${req.body.lastName||'Student'}`.trim(), email, phone:req.body.phone, password:req.body.password || generateTemporaryPassword(), role:'student', schoolCode:schoolCode(req), preferences:{testRunId:req.body.testRunId||null}, firstLogin:true, mustChangePassword:true, passwordIssuedAt:new Date() }); const row=await Student.create({ userId:user.id, elimuid:req.body.admissionNumber || undefined, grade:req.body.className || req.body.grade || 'Not Assigned', gender:normalizeGender(req.body.gender), parentName:req.body.parentName, parentEmail:req.body.parentEmail, parentPhone:req.body.parentPhone, preferences:{testRunId:req.body.testRunId||null, curriculum:req.body.curriculum||null} }); return ok(res,{...row.toJSON(), User:user.getPublicProfile?.() || user},'Student created'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/attendance', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const student = req.body.studentId ? await Student.findByPk(req.body.studentId) : await Student.findOne({ include:[{model:User, where:{schoolCode:schoolCode(req), role:'student'}}] }); if(!student) return fail(res,404,'Student not found'); const [row] = await Attendance.findOrCreate({ where:{ studentId:student.id, date:(req.body.date||new Date().toISOString()).slice(0,10) }, defaults:{ studentId:student.id, schoolCode:schoolCode(req), date:(req.body.date||new Date().toISOString()).slice(0,10), status:req.body.status || 'present', reportedBy:req.user.id } }); if(row.status !== req.body.status && req.body.status) await row.update({ status:req.body.status }); return ok(res,row,'Attendance saved'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/marks', authorize('admin','teacher','super_admin'), async (req,res)=>{
  try { const teacher = await currentTeacher(req).catch(()=>null); const student = req.body.studentId ? await Student.findByPk(req.body.studentId) : await Student.findOne({ include:[{model:User, where:{schoolCode:schoolCode(req), role:'student'}}] }); if(!student) return fail(res,404,'Student not found'); const score=Number(req.body.score ?? 0); const row=await AcademicRecord.create({ studentId:student.id, schoolCode:schoolCode(req), term:req.body.term || 'Term 1', year:Number(req.body.year || new Date().getFullYear()), subject:req.body.subject || 'General', assessmentType:req.body.assessmentType || 'test', assessmentName:req.body.assessmentName || 'Test Assessment', score, grade:req.body.grade || grade(score), teacherId:req.body.teacherId || teacher?.id || req.user.id, isPublished:req.body.isPublished !== false, remarks:req.body.remarks || null }); return ok(res,row,'Marks saved'); } catch(e){ return fail(res,500,e.message); }
});
router.post('/payments', authorize('admin','parent','super_admin'), async (req,res)=>{
  return fail(res, 405, 'Direct payment recording is disabled in production. Use /api/payments/parent/fee/stk, /api/payments/parent/subscription/stk, or confirmed Daraja callback reconciliation.');
});

// Teacher aliases expected by old dashboard tests.
router.get('/teacher/classes', authorize('teacher'), async (req,res)=>{ try{ const t=await currentTeacher(req); if(!t) return ok(res,[],'No teacher profile'); const rows=await Class.findAll({ where:{ schoolCode:schoolCode(req), [Op.or]:[{teacherId:t.id},{id:t.classId||null}] } }).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/teacher/attendance', authorize('teacher'), async (req,res)=>{ try{ const t=await currentTeacher(req); const rows=await Attendance.findAll({ where:{ schoolCode:schoolCode(req) }, limit:200, order:[['date','DESC']] }).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/teacher/marks', authorize('teacher'), async (req,res)=>{ try{ const t=await currentTeacher(req); const where={ schoolCode:schoolCode(req) }; if(t) where.teacherId=t.id; const rows=await AcademicRecord.findAll({ where, limit:500, order:[['createdAt','DESC']] }).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/teacher/timetable', authorize('teacher'), async (req,res)=>{ req.url='/timetable'; return router.handle(req,res); });
router.get('/teacher/announcements', authorize('teacher'), async (req,res)=>{ try{ const rows=await Alert.findAll({ where:{ schoolCode:schoolCode(req) }, limit:100, order:[['createdAt','DESC']] }).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/teacher/reports', authorize('teacher'), async (req,res)=>{ try{ const t=await currentTeacher(req); const where={schoolCode:schoolCode(req)}; if(t) where.teacherId=t.id; const rows=await AcademicRecord.findAll({where,limit:500}).catch(()=>[]); return ok(res,{records:rows}); }catch(e){return fail(res,500,e.message);} });

// Parent aliases.
router.get('/parent/dashboard', authorize('parent'), async (req,res)=>{ try{ const p=await currentParent(req); const payments=p? await Payment.findAll({where:{parentId:p.id},limit:50,order:[['createdAt','DESC']]}).catch(()=>[]):[]; return ok(res,{parent:p,payments}); }catch(e){return fail(res,500,e.message);} });
router.get('/parent/attendance', authorize('parent'), async (req,res)=>{ try{ const rows=await Attendance.findAll({where:{schoolCode:schoolCode(req)},limit:200,order:[['date','DESC']]}).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/parent/marks', authorize('parent'), async (req,res)=>{ try{ return ok(res,{message:'Use /api/parent/child/:studentId/marks for child-specific marks', records:[]}); }catch(e){return fail(res,500,e.message);} });
router.get('/parent/reports', authorize('parent'), async (req,res)=>{ try{ return ok(res,{message:'Use child reports generated from marks', reports:[]}); }catch(e){return fail(res,500,e.message);} });
router.get('/parent/announcements', authorize('parent'), async (req,res)=>{ try{ const rows=await Alert.findAll({where:{schoolCode:schoolCode(req)},limit:100,order:[['createdAt','DESC']]}).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/parent/ai-insights', authorize('parent'), async (req,res)=>{ try{ const p=await currentParent(req); if(!p) return fail(res,404,'Parent profile not found'); const children = p.getStudents ? await p.getStudents() : []; const insights = []; for (const child of children) { const summary = await academicSummary(child.id, schoolCode(req)); insights.push({ studentId:child.id, name:child.User?.name || child.elimuid, overallAverage:summary.overallAverage, overallGrade:summary.overallGrade, risk: summary.overallAverage != null && summary.overallAverage < 40 ? 'academic_support_needed' : 'normal' }); } return ok(res,{insights}); }catch(e){return fail(res,500,e.message);} });

// Student aliases.
router.get('/student/profile', authorize('student'), async (req,res)=>{ try{ const s=await currentStudent(req); return ok(res,s); }catch(e){return fail(res,500,e.message);} });
router.get('/student/marks', authorize('student'), async (req,res)=>{ try{ const s=await currentStudent(req); if(!s) return ok(res,{records:[]},'No student profile'); return ok(res, await academicSummary(s.id, schoolCode(req))); }catch(e){return fail(res,500,e.message);} });
router.get('/student/reports', authorize('student'), async (req,res)=>{ try{ const s=await currentStudent(req); if(!s) return ok(res,{reports:[]},'No student profile'); const summary=await academicSummary(s.id, schoolCode(req)); const snapshots = await ReportSnapshot.findAll({ where:{ schoolCode:schoolCode(req), studentId:s.id }, order:[['updatedAt','DESC']], limit:20 }).catch(()=>[]); return ok(res,{ reports:snapshots, summary }); }catch(e){return fail(res,500,e.message);} });
router.get('/student/timetable', authorize('student'), async (req,res)=>{ req.url='/timetable'; return router.handle(req,res); });
router.get('/student/announcements', authorize('student'), async (req,res)=>{ try{ const rows=await Alert.findAll({where:{schoolCode:schoolCode(req)},limit:100,order:[['createdAt','DESC']]}).catch(()=>[]); return ok(res,rows); }catch(e){return fail(res,500,e.message);} });
router.get('/student/ai-tutor', authorize('student'), async (req,res)=>{ try{ return ok(res,{enabled:true, endpoint:'/api/tutor/ask'}); }catch(e){return fail(res,500,e.message);} });

// Old AI path aliases.
router.get('/ai/tutor', async (req,res)=> ok(res,{enabled:true, endpoint:'/api/tutor/ask', method:'POST'}));
router.post('/ai/tutor', (req,res,next)=>{ req.url='/ask'; return tutorController.askTutor(req,res,next); });

// Dev/test cleanup by testRunId.
router.post('/test/cleanup', authorize('admin','super_admin'), async (req,res)=>{
  try {
    const testRunId = req.body?.testRunId; if(!testRunId) return fail(res,400,'testRunId required');
    const users = await User.findAll({ where:{ preferences:{ testRunId } }, attributes:['id'] }).catch(()=>[]);
    const userIds = users.map(u=>u.id);
    const students = await Student.findAll({ where:{ [Op.or]:[{ preferences:{ testRunId } }, ...(userIds.length?[{userId:{[Op.in]:userIds}}]:[])] }, attributes:['id'] }).catch(()=>[]);
    const studentIds = students.map(s=>s.id);
    const counts = {};
    counts.payments = await Payment.destroy({ where:{ metadata:{ testRunId } } }).catch(()=>0);
    if (studentIds.length) counts.attendance = await Attendance.destroy({ where:{ studentId:{[Op.in]:studentIds} } }).catch(()=>0);
    if (studentIds.length) counts.marks = await AcademicRecord.destroy({ where:{ studentId:{[Op.in]:studentIds} } }).catch(()=>0);
    counts.students = await Student.destroy({ where:{ [Op.or]:[{ preferences:{ testRunId } }, ...(userIds.length?[{userId:{[Op.in]:userIds}}]:[])] } }).catch(()=>0);
    counts.teachers = await Teacher.destroy({ where:{ ...(userIds.length?{userId:{[Op.in]:userIds}}:{id:-1}) } }).catch(()=>0);
    counts.parents = await Parent.destroy({ where:{ ...(userIds.length?{userId:{[Op.in]:userIds}}:{id:-1}) } }).catch(()=>0);
    counts.users = userIds.length ? await User.destroy({ where:{ id:{[Op.in]:userIds} } }).catch(()=>0) : 0;
    return ok(res, counts, 'Test data cleaned');
  } catch(e){ return fail(res,500,e.message); }
});

module.exports = router;
