'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('PaymentEvents', 'verificationMethod', {
      type: Sequelize.STRING,
      allowNull: true
    }).catch(() => null);
    await queryInterface.addColumn('PaymentEvents', 'sourceIp', {
      type: Sequelize.STRING,
      allowNull: true
    }).catch(() => null);

    // Remove older duplicate rows before creating the unique idempotency index.
    // Keeps the earliest event per provider/providerEventId and deletes later duplicates.
    await queryInterface.sequelize.query(`
      DELETE FROM "PaymentEvents" newer
      USING "PaymentEvents" older
      WHERE newer."provider" = older."provider"
        AND newer."providerEventId" = older."providerEventId"
        AND newer."providerEventId" IS NOT NULL
        AND newer."id" > older."id";
    `).catch(() => null);

    await queryInterface.addIndex('PaymentEvents', ['provider', 'providerEventId'], {
      unique: true,
      name: 'payment_events_provider_event_unique'
    }).catch(() => null);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('PaymentEvents', 'payment_events_provider_event_unique').catch(() => null);
    await queryInterface.removeColumn('PaymentEvents', 'sourceIp').catch(() => null);
    await queryInterface.removeColumn('PaymentEvents', 'verificationMethod').catch(() => null);
  }
};
