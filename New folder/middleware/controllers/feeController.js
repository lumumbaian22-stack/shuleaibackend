const { Fee, Payment, Parent, Student, User } = require('../models');
const { Op } = require('sequelize');

exports.getFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }
    const fees = await Fee.findAll({
      where: { studentId },
      order: [['year', 'DESC'], ['term', 'DESC']]
    });
    res.json({ success: true, data: fees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const { studentId, term, year, amount, method, reference } = req.body;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    let fee = await Fee.findOne({ where: { studentId, term, year } });
    if (!fee) {
      fee = await Fee.create({
        studentId,
        schoolCode: student.User.schoolCode,
        term,
        year,
        totalAmount: 5000, // default, can be adjusted
        paidAmount: 0,
        status: 'unpaid'
      });
    }

    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      feeId: fee.id,
      amount,
      method,
      reference: reference || `PAY-${Date.now()}`,
      status: 'completed',
      schoolCode: student.User.schoolCode
    });

    fee.paidAmount += amount;
    if (fee.paidAmount >= fee.totalAmount) fee.status = 'paid';
    else if (fee.paidAmount > 0) fee.status = 'partial';
    await fee.save();

    res.json({ success: true, data: { payment, fee } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
