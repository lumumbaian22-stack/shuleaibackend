'use strict';

function asInt(value, fallback = 0) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function transactionType(payment = {}) {
  const explicit = String(payment.transactionType || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (explicit) return explicit;
  const method = String(payment.method || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (['bursary', 'waiver', 'discount', 'correction', 'scholarship'].includes(method)) return method;
  if (method === 'admin_adjustment') return 'adjustment';
  return 'payment';
}

function classifyPaymentIntegrity(payment) {
  const row = payment?.toJSON ? payment.toJSON() : (payment || {});
  const fee = row.Fee || row.fee || null;
  const amount = asInt(row.amount, NaN);
  const txType = transactionType(row);
  const metadataStatus = String(row.metadata?.integrityStatus || '').toLowerCase();
  let integrityReason = null;

  if (['quarantined', 'invalid'].includes(metadataStatus)) {
    integrityReason = row.metadata?.integrityReason || 'Record was previously quarantined.';
  } else if (!fee) {
    integrityReason = 'Linked fee account is missing.';
  } else if (Number(fee.studentId || row.studentId) !== Number(row.studentId)) {
    integrityReason = 'Payment and fee belong to different students.';
  } else if (fee.schoolCode && row.schoolCode && String(fee.schoolCode) !== String(row.schoolCode)) {
    integrityReason = 'Payment and fee belong to different schools.';
  } else if (!Number.isFinite(amount) || amount <= 0) {
    integrityReason = 'Payment amount is invalid.';
  } else if (!['reversal', 'refund'].includes(txType) && amount > asInt(fee.totalAmount)) {
    integrityReason = 'Payment amount exceeds the full linked fee invoice.';
  }

  const integrityValid = !integrityReason;
  return {
    integrityValid,
    integrityStatus: integrityValid ? 'valid' : 'quarantined',
    integrityReason,
    parentVisible: integrityValid,
    verificationActionable: integrityValid
      && ['pending', 'pending_verification'].includes(String(row.status || '').toLowerCase())
  };
}

module.exports = { classifyPaymentIntegrity };
