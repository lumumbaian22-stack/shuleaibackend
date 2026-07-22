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

    const [rows] = await queryInterface.sequelize.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN (:tables)`,
      { replacements: { tables: Object.keys(required) } }
    );
    const found = new Map();
    for (const row of rows) {
      if (!found.has(row.table_name)) found.set(row.table_name, new Set());
      found.get(row.table_name).add(row.column_name);
    }
    for (const [table, columns] of Object.entries(required)) {
      const present = found.get(table) || new Set();
      const missing = columns.filter(column => !present.has(column));
      if (missing.length) throw new Error(`Critical finance schema verification failed: ${table} is missing ${missing.join(', ')}`);
    }
  },
  async down() {}
};
