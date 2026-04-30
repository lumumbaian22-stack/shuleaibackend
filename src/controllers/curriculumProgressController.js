const { Op } = require('sequelize');
const { Class, Teacher, User, AcademicRecord, Student } = require('../models');

function subjectListFromClass(cls) {
  return (cls.subjectTeachers || []).filter(a => a.subject).map(a => ({
    subject:a.subject,
    teacherId:a.teacherId,
    teacherName:a.teacherName || '',
    totalTopics:Number(a.totalTopics || 10),
    completedTopics:Number(a.completedTopics || 0),
    startedAt:a.startedAt || null,
    updatedAt:a.updatedAt || null,
    notes:a.notes || ''
  }));
}
function pct(done,total){ return total ? Math.min(100, Math.round((done/total)*100)) : 0; }

exports.getAdminCurriculumProgress = async (req,res) => {
  try {
    const classes = await Class.findAll({ where:{ schoolCode:req.user.schoolCode, isActive:true }, order:[['grade','ASC'],['name','ASC']] });
    const data = classes.map(cls => {
      const subjects = subjectListFromClass(cls).map(s => ({ ...s, progress:pct(s.completedTopics,s.totalTopics), status:s.completedTopics<=0?'not_started':s.completedTopics>=s.totalTopics?'complete':'in_progress' }));
      const avg = subjects.length ? Math.round(subjects.reduce((a,b)=>a+b.progress,0)/subjects.length) : 0;
      return { classId:cls.id, className:cls.name, grade:cls.grade, stream:cls.stream, averageProgress:avg, subjects };
    });
    res.json({ success:true, data:{ classes:data, updatedAt:new Date() } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.getTeacherCurriculumProgress = async (req,res) => {
  try {
    const teacher = await Teacher.findOne({ where:{ userId:req.user.id } });
    if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const classes = await Class.findAll({ where:{ schoolCode:req.user.schoolCode, isActive:true } });
    const data = [];
    for (const cls of classes) {
      const isClassTeacher = Number(cls.teacherId) === Number(teacher.id);
      const subjects = subjectListFromClass(cls).filter(s => isClassTeacher || Number(s.teacherId) === Number(teacher.id)).map(s => ({ ...s, progress:pct(s.completedTopics,s.totalTopics), status:s.completedTopics<=0?'not_started':s.completedTopics>=s.totalTopics?'complete':'in_progress' }));
      if (subjects.length) data.push({ classId:cls.id, className:cls.name, isClassTeacher, subjects });
    }
    res.json({ success:true, data:{ teacherId:teacher.id, classes:data, updatedAt:new Date() } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.updateTeacherCurriculumProgress = async (req,res) => {
  try {
    const { classId, subject, totalTopics, completedTopics, notes, startedAt } = req.body;
    const teacher = await Teacher.findOne({ where:{ userId:req.user.id } });
    if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } });
    if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    const assignments = cls.subjectTeachers || [];
    const index = assignments.findIndex(a => String(a.subject).toLowerCase() === String(subject).toLowerCase() && Number(a.teacherId) === Number(teacher.id));
    const isClassTeacher = Number(cls.teacherId) === Number(teacher.id);
    if (index < 0 && !isClassTeacher) return res.status(403).json({ success:false, message:'You can only update curriculum progress for assigned subjects/classes' });
    const targetIndex = index >= 0 ? index : assignments.findIndex(a => String(a.subject).toLowerCase() === String(subject).toLowerCase());
    if (targetIndex < 0) return res.status(404).json({ success:false, message:'Subject assignment not found' });
    assignments[targetIndex] = {
      ...assignments[targetIndex],
      totalTopics:Number(totalTopics || assignments[targetIndex].totalTopics || 10),
      completedTopics:Number(completedTopics || 0),
      notes:notes || '',
      startedAt:startedAt || assignments[targetIndex].startedAt || new Date(),
      updatedAt:new Date()
    };
    await cls.update({ subjectTeachers:assignments });
    res.json({ success:true, data:{ classId:cls.id, subject, progress:pct(assignments[targetIndex].completedTopics, assignments[targetIndex].totalTopics) } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};