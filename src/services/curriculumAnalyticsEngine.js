const { Op } = require('sequelize');
const { AcademicRecord, Attendance, LearningMaterial, TutorMessage, TutorInsight, ResourceViews } = require('../models');

function avg(nums) { return nums.length ? nums.reduce((a,b)=>a+Number(b||0),0) / nums.length : 0; }
function mastery(score) { if (score >= 80) return 'exceeding'; if (score >= 60) return 'meeting'; if (score >= 40) return 'approaching'; return 'below'; }
function trend(records) {
  const ordered = records.slice().sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));
  if (ordered.length < 4) return 'insufficient-data';
  const first = avg(ordered.slice(0, Math.ceil(ordered.length/2)).map(r=>r.score));
  const last = avg(ordered.slice(Math.floor(ordered.length/2)).map(r=>r.score));
  if (last - first >= 8) return 'improving';
  if (first - last >= 8) return 'declining';
  return 'stable';
}
function band(score) { if(score>=80) return 'strength'; if(score>=60) return 'secure'; if(score>=40) return 'needs-practice'; return 'urgent-support'; }
async function analyzeStudent(student) {
  const records = await AcademicRecord.findAll({ where: { studentId: student.id }, order: [['date','DESC']] });
  const attendance = await Attendance.findAll({ where: { studentId: student.id } });
  const bySubject = {};
  records.forEach(r => { if(!bySubject[r.subject]) bySubject[r.subject]=[]; bySubject[r.subject].push(r); });
  const subjects = Object.entries(bySubject).map(([subject, recs])=>{
    const score = Math.round(avg(recs.map(r=>r.score)));
    const recent = recs.slice(0,5);
    return { subject, average: score, mastery: mastery(score), risk: band(score), trend: trend(recs), assessments: recs.length, latestScore: recent[0]?.score ?? null };
  }).sort((a,b)=>a.average-b.average);
  const present = attendance.filter(a=>a.status==='present').length;
  const attendanceRate = attendance.length ? Math.round(present/attendance.length*100) : null;
  const weakAreas = subjects.filter(s=>s.average < 60).map(s=>s.subject);
  const strongAreas = subjects.filter(s=>s.average >= 75).map(s=>s.subject);
  const recommendations = [];
  for (const subject of weakAreas.slice(0,3)) {
    const materials = await LearningMaterial.findAll({ where: { subject, gradeLevel: { [Op.or]: [student.grade, 'All', 'General'] }, isActive: true }, limit: 3 });
    recommendations.push({ subject, action: 'Schedule guided revision and short practice', materials: materials.map(m=>({ id:m.id, title:m.title, accessLevel:m.accessLevel })) });
  }
  return { studentId: student.id, grade: student.grade, overallAverage: Math.round(avg(subjects.map(s=>s.average))), attendanceRate, weakAreas, strongAreas, subjects, recommendations };
}
async function updateTutorInsight({ student, subject, interaction, materials=[] }) {
  const records = await AcademicRecord.findAll({ where: { studentId: student.id, subject } });
  const average = Math.round(avg(records.map(r=>r.score)));
  const weakAreas = average && average < 60 ? [subject] : [];
  const strengthAreas = average >= 75 ? [subject] : [];
  const [row] = await TutorInsight.findOrCreate({ where: { studentId: student.id, subject }, defaults: { studentId: student.id, schoolCode: student.User?.schoolCode || interaction.schoolCode, subject, gradeLevel: student.grade, masteryScore: average || 0 } });
  await row.update({ masteryScore: average || row.masteryScore || 0, weakAreas, strengthAreas, recommendedMaterials: materials, recommendedActivities: interaction.practice || [], lastInteractionAt: new Date(), evidence: { lastIntent: interaction.intent, confidence: interaction.confidence, updatedFrom: 'tutor_chat' } });
  return row;
}
module.exports = { analyzeStudent, updateTutorInsight, mastery };
