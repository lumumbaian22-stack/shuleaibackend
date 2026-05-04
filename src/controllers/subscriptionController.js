const { Op } = require('sequelize');
const { SubscriptionPlan, Parent, Student, User, Payment } = require('../models');

const DEFAULT_PLANS = [
  { id: 'basic', name: 'basic', displayName: 'Basic', price_kes: 150, features: ['Student dashboard', 'Basic reports', 'Homework tasks'] },
  { id: 'premium', name: 'premium', displayName: 'Premium', price_kes: 300, features: ['Advanced reports', 'Parent guidance', 'Gamified missions'] },
  { id: 'ultimate', name: 'ultimate', displayName: 'Ultimate', price_kes: 800, features: ['Full analytics', 'Priority support', 'AI-ready learning tools'] }
];

function normalizePlan(plan){
  const value = String(plan || 'basic').toLowerCase();
  return ['basic', 'premium', 'ultimate'].includes(value) ? value : 'basic';
}

async function getParentWithStudents(userId){
  const parent = await Parent.findOne({ where: { userId }, include: [{ model: Student, as: 'students', include: [{ model: User, attributes: ['id', 'name', 'email'] }] }] });
  return parent;
}

exports.getPlans = async (req, res) => {
  try {
    let plans = [];
    try {
      const schoolId = req.user?.school?.id || null;
      plans = await SubscriptionPlan.findAll({
        where: {
          [Op.or]: [{ schoolId }, { schoolId: null }],
          isActive: true
        },
        order: [['price_kes', 'ASC']]
      });
    } catch (dbError) {
      console.warn('SubscriptionPlan lookup fallback:', dbError.message);
    }
    const data = plans.length ? plans : DEFAULT_PLANS;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStatus = async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const student = await Student.findOne({ where: { userId: req.user.id } });
      if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
      return res.json({ success: true, data: { students: [{ id: student.id, name: req.user.name, plan: student.subscriptionPlan, status: student.subscriptionStatus, expiry: student.subscriptionExpiry, remainingDays: student.getRemainingSubscriptionDays?.() || 0 }], primary: student } });
    }

    if (req.user.role !== 'parent') {
      return res.json({ success: true, data: { role: req.user.role, message: 'Subscription status is only enforced for parent/student access in this build.' } });
    }

    const parent = await getParentWithStudents(req.user.id);
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
    const students = (parent.students || []).map(s => ({
      id: s.id,
      name: s.User?.name || s.elimuid,
      plan: s.subscriptionPlan,
      status: s.subscriptionStatus,
      expiry: s.subscriptionExpiry,
      remainingDays: s.getRemainingSubscriptionDays?.() || 0
    }));
    res.json({ success: true, data: { parentId: parent.id, students, primary: students[0] || null } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.upgrade = async (req, res) => {
  try {
    const { studentId, planName, plan, amount } = req.body || {};
    const selectedPlan = normalizePlan(planName || plan);
    const prices = { basic: 150, premium: 300, ultimate: 800 };
    const parent = await getParentWithStudents(req.user.id);
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });

    const child = (parent.students || []).find(s => String(s.id) === String(studentId)) || parent.students?.[0];
    if (!child) return res.status(404).json({ success: false, message: 'No linked student found for this parent' });

    // Production-safe behavior: do not silently mark a paid subscription complete unless a real payment has completed.
    // This endpoint creates/keeps a pending subscription request. M-PESA activation happens through /api/payments/parent/subscription/stk + Daraja callback.
    const payment = await Payment.create({
      studentId: child.id,
      parentId: parent.id,
      amount: Number(amount || prices[selectedPlan]),
      method: 'mpesa',
      reference: `SUB-REQ-${Date.now()}`,
      plan: selectedPlan,
      status: 'pending',
      schoolCode: req.user.schoolCode,
      paymentType: 'subscription',
      currency: 'KES',
      paymentGateway: 'daraja',
      metadata: { source: 'subscription-upgrade-request', requiresStk: true }
    });

    await child.update({ subscriptionPlan: selectedPlan, subscriptionStatus: 'pending' });
    res.json({
      success: true,
      message: 'Subscription request created. Complete M-PESA STK payment to activate it.',
      data: { studentId: child.id, plan: selectedPlan, status: 'pending', paymentId: payment.id, amount: payment.amount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
