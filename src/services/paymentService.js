/**
 * Production payment service.
 * This service deliberately does not mark payments as completed directly.
 * Payments are completed only by confirmed gateway callbacks handled in paymentController.darajaCallback.
 */
const { Payment } = require('../models');

const processPayment = async () => {
  throw new Error('Direct payment processing is disabled. Use Daraja STK initiation and callback confirmation.');
};

const verifyPayment = async (checkoutRequestId) => {
  if (!checkoutRequestId) return false;
  const payment = await Payment.findOne({ where: { transactionId: checkoutRequestId } });
  return !!payment && payment.status === 'completed';
};

module.exports = { processPayment, verifyPayment };
