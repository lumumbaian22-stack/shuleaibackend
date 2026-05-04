const { Parent, Student, School, Payment } = require('../models');
const { getParentPlans, getSchoolPlans, getParentStatus, getSchoolStatus, activateParentSubscription, activateSchoolSubscription } = require('../services/subscriptionService');

async function parentForUser(user){ return Parent.findOne({ where:{ userId:user.id } }); }

exports.getPlans = async (req,res)=>{ try{ res.json({success:true,data:{ parentPlans: await getParentPlans(), schoolPlans: await getSchoolPlans() }}); }catch(e){res.status(500).json({success:false,message:e.message});} };
exports.getMyStatus = async (req,res)=>{ try{
  if(req.user.role==='student'){ const student=await Student.findOne({where:{userId:req.user.id}}); if(!student) return res.status(404).json({success:false,message:'Student not found'}); const fake={preferences:{subscription:{plan:student.subscriptionPlan,status:student.subscriptionStatus,expiry:student.subscriptionExpiry}}}; return res.json({success:true,data:await getParentStatus(fake, student)}); }
  if(req.user.role==='parent'){ const parent=await parentForUser(req.user); if(!parent) return res.status(404).json({success:false,message:'Parent not found'}); return res.json({success:true,data:await getParentStatus(parent)}); }
  if(['admin','teacher'].includes(req.user.role)){ const school=await School.findOne({where:{schoolId:req.user.schoolCode}}); if(!school) return res.status(404).json({success:false,message:'School not found'}); return res.json({success:true,data:await getSchoolStatus(school)}); }
  res.json({success:true,data:{plan:'platform',status:'active'}});
}catch(e){res.status(500).json({success:false,message:e.message});} };
exports.upgrade = async (req,res)=>{ try{
  const { plan='basic', studentId, days=30 }=req.body||{}; const parent=await parentForUser(req.user); if(!parent) return res.status(404).json({success:false,message:'Parent not found'});
  const student=studentId ? await Student.findByPk(studentId) : null; if(student && parent.hasStudent && !(await parent.hasStudent(student))) return res.status(403).json({success:false,message:'Not your child'});
  const status=await activateParentSubscription({parent,student,plan,days,amount:0,source:'manual-admin-or-test'}); res.json({success:true,message:'Subscription updated',data:status});
}catch(e){res.status(500).json({success:false,message:e.message});} };
exports.manualOverride = async (req,res)=>{ try{
  if(req.user.role!=='super_admin') return res.status(403).json({success:false,message:'Forbidden'});
  const { targetType, targetId, plan='premium', days=30, reason='Manual override' }=req.body||{};
  if(targetType==='school'){ const school=await School.findOne({where:{schoolId:targetId}})||await School.findByPk(targetId); if(!school) return res.status(404).json({success:false,message:'School not found'}); const settings=school.settings||{}; settings.subscription={...(settings.subscription||{}),manualOverride:{active:true,plan,reason,createdBy:req.user.id,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+days*86400000).toISOString()}}; await school.update({settings}); return res.json({success:true,data:await getSchoolStatus(school)}); }
  if(targetType==='parent'){ const parent=await Parent.findByPk(targetId); if(!parent) return res.status(404).json({success:false,message:'Parent not found'}); const prefs=parent.preferences||{}; prefs.subscription={...(prefs.subscription||{}),manualOverride:{active:true,plan,reason,createdBy:req.user.id,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+days*86400000).toISOString()}}; await parent.update({preferences:prefs}); return res.json({success:true,data:await getParentStatus(parent)}); }
  return res.status(400).json({success:false,message:'targetType must be school or parent'});
}catch(e){res.status(500).json({success:false,message:e.message});} };
exports.activateSchool = async (req,res)=>{ try{
  if(!['super_admin','admin'].includes(req.user.role)) return res.status(403).json({success:false,message:'Forbidden'});
  const schoolCode=req.user.role==='super_admin' ? (req.body.schoolCode || req.params.schoolCode) : req.user.schoolCode;
  const school=await School.findOne({where:{schoolId:schoolCode}}); if(!school) return res.status(404).json({success:false,message:'School not found'});
  const status=await activateSchoolSubscription({school,plan:req.body.plan||'monthly',amount:req.body.amount||0,days:req.body.days,source:'manual'}); res.json({success:true,data:status});
}catch(e){res.status(500).json({success:false,message:e.message});} };
exports.initiatePayment = exports.upgrade;
