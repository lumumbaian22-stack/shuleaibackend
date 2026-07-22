'use strict';

const paymentSchema = require('./20260626000000-v1520-final-payment-engine-lock');
const financialSchema = require('./20260626010000-v200-financial-system-lock');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Re-run the idempotent schema builders because older versions swallowed
    // non-duplicate database errors and may already be recorded as completed.
    await paymentSchema.up(queryInterface, Sequelize);
    await financialSchema.up(queryInterface, Sequelize);

    const required = {
      Payments: ['paymentDestination', 'providerReference', 'promptType', 'promptStatus', 'reconciliationStatus'],
      PaymentEvents: ['paymentId', 'schoolCode', 'provider', 'providerEventId', 'processed'],
      SchoolPaymentSettings: ['enabledProviders', 'defaultProvider'],
      PlatformPaymentSettings: ['enabledProviders', 'defaultProvider'],
      FeeInvoices: ['schoolCode', 'studentId', 'invoiceNumber', 'balanceAmount', 'status'],
      StudentFeeAccounts: ['schoolCode', 'studentId', 'balanceAmount', 'status'],
      PaymentTransactions: ['schoolCode', 'internalReference', 'provider', 'amount', 'status'],
      PaymentReconciliations: ['provider', 'result', 'checkedAt'],
      ProviderCredentialsAudits: ['provider', 'action', 'changedFields'],
      PaymentRefunds: ['provider', 'amount', 'status'],
      PlatformSubscriptions: ['schoolCode', 'planCode', 'status']
    };

    for (const [table, columns] of Object.entries(required)) {
      const description = await queryInterface.describeTable(table);
      const missing = columns.filter(column => !description[column]);
      if (missing.length) throw new Error(`Critical finance schema verification failed: ${table} is missing ${missing.join(', ')}`);
    }
  },
  async down() {}
};
