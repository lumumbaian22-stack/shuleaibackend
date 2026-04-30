const { Op } = require('sequelize');
const { User, Student, Teacher, Class, School, AcademicRecord, Message, SchoolCalendar } = require('../models');

function like(q) { return `%${String(q || '').trim()}%`; }
function limitRole(role) {
  return role === 'super_admin' ? null : role;
}

exports.globalSearch = async (req, res) => {
  try {
    const { q = '', scope = 'auto' } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: { query:q, results: [] } });
    }

    const term = like(q);
    const role = req.user.role;
    const schoolCode = req.user.schoolCode;
    const results = [];

    if (role === 'super_admin') {
      const schools = await School.findAll({
        where: {
          [Op.or]: [
            { schoolId: { [Op.iLike]: term } },
            { shortCode: { [Op.iLike]: term } },
            { name: { [Op.iLike]: term } },
            { approvedName: { [Op.iLike]: term } },
            { requestedName: { [Op.iLike]: term } }
          ]
        },
        limit: 15
      }).catch(()=>[]);
      schools.forEach(s => results.push({
        type:'school',
        id:s.id,
        title:s.approvedName || s.platformDisplayName || 'ShuleAI School',
        subtitle:`${s.schoolId} • ${s.status} • ${s.system}`,
        section:'schools',
        data:s
      }));

      const users = await User.findAll({
        where:{ [Op.or]:[{ name:{[Op.iLike]:term} }, { email:{[Op.iLike]:term} }, { role:{[Op.iLike]:term} }] },
        attributes:['id','name','email','role','schoolCode','isActive'],
        limit:20
      }).catch(()=>[]);
      users.forEach(u => results.push({ type:'user', id:u.id, title:u.name, subtitle:`${u.role} • ${u.schoolCode || 'platform'}`, section:'users', data:u }));
    } else {
      const usersWhere = {
        schoolCode,
        [Op.or]: [{ name:{[Op.iLike]:term} }, { email:{[Op.iLike]:term} }, { phone:{[Op.iLike]:term} }]
      };

      if (['admin'].includes(role)) {
        const classes = await Class.findAll({ where:{ schoolCode, isActive:true, [Op.or]:[{ name:{[Op.iLike]:term} }, { grade:{[Op.iLike]:term} }, { stream:{[Op.iLike]:term} }] }, limit:15 }).catch(()=>[]);
        classes.forEach(c => results.push({ type:'class', id:c.id, title:c.name, subtitle:`${c.grade || ''} ${c.stream || ''}`, section:'classes', data:c }));
      }

      const students = await Student.findAll({
        where:{ [Op.or]:[{ elimuid:{[Op.iLike]:term} }, { assessmentNumber:{[Op.iLike]:term} }, { nemisNumber:{[Op.iLike]:term} }, { grade:{[Op.iLike]:term} }] },
        include:[{ model:User, where:usersWhere, attributes:['id','name','email','profileImage'] }],
        limit:15
      }).catch(()=>[]);
      students.forEach(s => results.push({ type:'student', id:s.id, title:s.User?.name, subtitle:`${s.grade || ''} • ${s.elimuid || ''}`, section: role === 'teacher' ? 'students' : 'students', data:s }));

      const teachers = await Teacher.findAll({
        where:{ [Op.or]:[{ employeeId:{[Op.iLike]:term} }, { department:{[Op.iLike]:term} }] },
        include:[{ model:User, where:{...usersWhere, role:'teacher'}, attributes:['id','name','email'] }],
        limit:15
      }).catch(()=>[]);
      teachers.forEach(t => results.push({ type:'teacher', id:t.id, title:t.User?.name, subtitle:`${t.employeeId || ''} • ${t.department || ''}`, section:'teachers', data:t }));

      const records = await AcademicRecord.findAll({ where:{ schoolCode, [Op.or]:[{ subject:{[Op.iLike]:term} }, { assessmentName:{[Op.iLike]:term} }, { term:{[Op.iLike]:term} }] }, limit:15 }).catch(()=>[]);
      records.forEach(r => results.push({ type:'marks', id:r.id, title:`${r.subject} ${r.score}%`, subtitle:`${r.term} ${r.year} • ${r.assessmentName || ''}`, section:'analytics', data:r }));

      const events = await SchoolCalendar.findAll({ where:{ schoolCode, [Op.or]:[{ title:{[Op.iLike]:term} }, { description:{[Op.iLike]:term} }, { type:{[Op.iLike]:term} }] }, limit:10 }).catch(()=>[]);
      events.forEach(e => results.push({ type:'calendar', id:e.id, title:e.title, subtitle:`${e.type || 'event'} • ${e.startDate || e.date || ''}`, section:'calendar', data:e }));
    }

    res.json({ success:true, data:{ query:q, role, results, count:results.length } });
  } catch(error) {
    console.error('Search error:', error);
    res.status(500).json({ success:false, message:error.message });
  }
};