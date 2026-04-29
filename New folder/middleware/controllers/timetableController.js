const { Timetable, Class, Teacher, User } = require('../models');
const moment = require('moment');

const DAYS = ['monday','tuesday','wednesday','thursday','friday'];
const PERIODS = [
  { label:'Period 1', start:'08:00', end:'08:40' }, { label:'Period 2', start:'08:40', end:'09:20' },
  { label:'Period 3', start:'09:20', end:'10:00' }, { label:'Break', start:'10:00', end:'10:30', break:true },
  { label:'Period 4', start:'10:30', end:'11:10' }, { label:'Period 5', start:'11:10', end:'11:50' },
  { label:'Period 6', start:'11:50', end:'12:30' }, { label:'Lunch', start:'12:30', end:'14:00', break:true },
  { label:'Period 7', start:'14:00', end:'14:40' }, { label:'Period 8', start:'14:40', end:'15:20' },
  { label:'Period 9', start:'15:20', end:'16:00' }
];
function weight(subject){ const s=String(subject||'').toLowerCase(); if(/math|english|kiswahili|science|biology|chemistry|physics/.test(s)) return 5; if(/social|history|geography|cre|ire|agriculture|business|computer/.test(s)) return 3; return 2; }
function shell(){ return DAYS.map(day => ({ day, periods: PERIODS.map(p => ({ ...p, classes:[] })) })); }
async function generateBalanced(schoolId, opts={}){
  const classes = await Class.findAll({ where:{ schoolCode:schoolId, isActive:true }, order:[['grade','ASC'],['name','ASC']] });
  const teacherIds = new Set(); classes.forEach(c => (c.subjectTeachers||[]).forEach(a => a.teacherId && teacherIds.add(Number(a.teacherId))));
  const teachers = await Teacher.findAll({ where:{ id:Array.from(teacherIds) }, include:[{ model:User, attributes:['id','name','email'] }] });
  const teacherMap = new Map(teachers.map(t => [Number(t.id), t]));
  const slots=shell(), classResults=[], teacherBusy={}, classBusy={}, daily={}, warnings=[];
  for(const cls of classes){
    const classSlots=shell(); const assignments=(cls.subjectTeachers||[]).filter(a=>a.subject && a.teacherId);
    if(!assignments.length){ warnings.push({ classId:cls.id, className:cls.name, message:'No subject teacher assignments' }); continue; }
    const lessons=[]; assignments.forEach(a => { for(let i=0;i<weight(a.subject);i++) lessons.push(a); }); lessons.sort((a,b)=>weight(b.subject)-weight(a.subject));
    for(const a of lessons){ let placed=false; const teacher=teacherMap.get(Number(a.teacherId)); if(!teacher){ warnings.push({ classId:cls.id, subject:a.subject, teacherId:a.teacherId, message:'Teacher not found' }); continue; }
      for(const day of DAYS){ if((daily[`${cls.id}:${day}:${a.subject}`]||0)>=2) continue; for(let pi=0; pi<PERIODS.length; pi++){ const period=PERIODS[pi]; if(period.break) continue; const key=`${day}:${period.start}`; teacherBusy[key]=teacherBusy[key]||new Set(); classBusy[key]=classBusy[key]||new Set(); if(teacherBusy[key].has(Number(a.teacherId))||classBusy[key].has(Number(cls.id))) continue; const lesson={ classId:cls.id, className:cls.name, grade:cls.grade, stream:cls.stream, subject:a.subject, teacherId:Number(a.teacherId), teacherName:teacher.User?.name || a.teacherName || 'Unknown', startTime:period.start, endTime:period.end, term:opts.term, year:opts.year, scope:opts.scope||'term' }; slots.find(d=>d.day===day).periods[pi].classes.push(lesson); classSlots.find(d=>d.day===day).periods[pi].classes.push(lesson); teacherBusy[key].add(Number(a.teacherId)); classBusy[key].add(Number(cls.id)); daily[`${cls.id}:${day}:${a.subject}`]=(daily[`${cls.id}:${day}:${a.subject}`]||0)+1; placed=true; break; } if(placed) break; }
      if(!placed) warnings.push({ classId:cls.id, className:cls.name, subject:a.subject, teacherId:a.teacherId, message:'Could not place lesson without conflict' });
    }
    classResults.push({ classId:cls.id, className:cls.name, grade:cls.grade, stream:cls.stream, timetable:classSlots });
  }
  return { slots, classes:classResults, warnings };
}
exports.generate = async (req,res) => { try { const schoolId=req.user.schoolCode; const { weekStartDate, term='Term 1', year=new Date().getFullYear(), scope='term', publish=false }=req.body; const weekStart=weekStartDate||moment().startOf('isoWeek').format('YYYY-MM-DD'); const generated=await generateBalanced(schoolId,{term,year:Number(year),scope}); const [tt,created]=await Timetable.findOrCreate({ where:{ schoolId, weekStartDate:weekStart }, defaults:{ weekStartDate:weekStart, term, year:Number(year), scope, slots:generated.slots, classes:generated.classes, warnings:generated.warnings, isPublished:!!publish } }); if(!created) await tt.update({ term, year:Number(year), scope, slots:generated.slots, classes:generated.classes, warnings:generated.warnings, isPublished:!!publish }); res.json({ success:true, message:`Generated timetable for ${generated.classes.length} class(es)`, data:tt }); } catch(error){ console.error('Generate timetable error:', error); res.status(500).json({ success:false, message:error.message }); } };
exports.getClasses = async (req,res) => { try { const classes=await Class.findAll({ where:{ schoolCode:req.user.schoolCode, isActive:true }, order:[['grade','ASC'],['name','ASC']] }); res.json({ success:true, data:classes }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
exports.manualUpdate = async (req,res) => { try { await Timetable.update({ slots:req.body.slots, classes:req.body.classes, warnings:req.body.warnings }, { where:{ id:req.params.id, schoolId:req.user.schoolCode } }); res.json({ success:true }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
exports.publish = async (req,res) => { try { await Timetable.update({ isPublished:true }, { where:{ id:req.params.id, schoolId:req.user.schoolCode } }); res.json({ success:true }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
exports.getForClass = async (req,res) => { try { const tt=await Timetable.findOne({ where:{ schoolId:req.user.schoolCode, weekStartDate:req.query.weekStart||moment().startOf('isoWeek').format('YYYY-MM-DD') } }); if(!tt) return res.json({ success:true, data:[] }); const found=(tt.classes||[]).find(c=>Number(c.classId)===Number(req.params.classId)); res.json({ success:true, data:found?found.timetable:[] }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
exports.getForTeacher = async (req,res) => { try { const tt=await Timetable.findOne({ where:{ schoolId:req.user.schoolCode, weekStartDate:req.query.weekStart||moment().startOf('isoWeek').format('YYYY-MM-DD') } }); if(!tt) return res.json({ success:true, data:[] }); const data=(tt.slots||[]).map(d=>({ day:d.day, periods:(d.periods||[]).map(p=>({ ...p, classes:(p.classes||[]).filter(c=>Number(c.teacherId)===Number(req.params.teacherId)) })).filter(p=>p.break||p.classes.length) })).filter(d=>d.periods.length); res.json({ success:true, data }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
exports.getByWeek = async (req,res) => { try { const where={ schoolId:req.user.schoolCode, weekStartDate:req.query.weekStartDate||moment().startOf('isoWeek').format('YYYY-MM-DD') }; if(req.query.term) where.term=req.query.term; if(req.query.year) where.year=Number(req.query.year); const tt=await Timetable.findOne({ where, order:[['updatedAt','DESC']] }); res.json({ success:true, data:tt||null }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };
