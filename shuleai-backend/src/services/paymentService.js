/**
 * Payment Service (placeholder for integration with MPesa, Stripe, etc.)
 * Currently only logs payments and updates database.
 */

const { Payment, Fee, Student } = require('../models');
const { createAlert } = require('./notificationService');

/**
 * Process a payment (mock implementation)
 * @param {Object} paymentData - { studentId, parentId, amount, method, reference, plan }
 * @returns {Promise<Object>} - The created payment record
 */
const processPayment = async (paymentData) => {
  try {
    const { studentId, parentId, amount, method, reference, plan } = paymentData;

    // Find or create fee record
    let fee = await Fee.findOne({ where: { studentId, status: 'unpaid' } });
    if (!fee) {
      // Create a dummy fee for the term
      fee = await Fee.create({
        studentId,
        schoolCode: (await Student.findByPk(studentId)).schoolCode,
        term: 'Term 1',
        year: new Date().getFullYear(),
        totalAmount: 5000, // placeholder, should come from school fee structure
        paidAmount: 0,
        paymentPlan: plan || 'basic'
      });
    }

    // Create payment record
    const payment = await Payment.create({
      studentId,
      parentId,
      feeId: fee.id,
      amount,
      method,
      reference,
      plan: plan || fee.paymentPlan,
      status: 'completed' // assume success for demo
    });

    // Update fee paid amount
    fee.paidAmount = (fee.paidAmount || 0) + amount;
    await fee.save();

    // If fully paid, unlock student's payment status
    if (fee.balance <= 0) {
      const student = await Student.findByPk(studentId);
      student.paymentStatus = { plan: fee.paymentPlan, paid: fee.paidAmount, status: 'unlocked' };
      await student.save();

      // Notify parent and student
      await createAlert({
        userId: parentId,
        role: 'parent',
        type: 'fee',
        severity: 'success',
        title: 'Payment Successful',
        message: `Payment of KES ${amount} received. Access unlocked.`
      });
    }

    return payment;
  } catch (error) {
    console.error('Payment processing error:', error);
    throw error;
  }
};

/**
 * Verify payment with external gateway (mock)
 * @param {String} reference - Payment reference
 * @returns {Promise<Boolean>}
 */
const verifyPayment = async (reference) => {
  // In real implementation, call MPesa API or similar
  return true;
};

module.exports = {
  processPayment,
  verifyPayment
};