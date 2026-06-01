'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const add = async (table, column, spec) => queryInterface.addColumn(table, column, spec).catch(() => null);
    await add('Users', 'signature', { type: Sequelize.TEXT, allowNull: true });
    await add('Teachers', 'signature', { type: Sequelize.TEXT, allowNull: true });
    await add('Admins', 'signature', { type: Sequelize.TEXT, allowNull: true });

    await add('SchoolCalendars', 'visibility', { type: Sequelize.STRING, allowNull: false, defaultValue: 'personal' });
    await add('SchoolCalendars', 'createdByUserId', { type: Sequelize.INTEGER, allowNull: true });
    await add('SchoolCalendars', 'targetRole', { type: Sequelize.STRING, allowNull: true });
    await add('SchoolCalendars', 'targetUserId', { type: Sequelize.INTEGER, allowNull: true });
    await add('SchoolCalendars', 'classId', { type: Sequelize.INTEGER, allowNull: true });
    await add('SchoolCalendars', 'metadata', { type: Sequelize.JSONB, allowNull: true, defaultValue: {} });

    await add('SchoolPaymentRequests', 'billingCycle', { type: Sequelize.STRING, allowNull: false, defaultValue: 'monthly' });
    await add('SchoolPaymentRequests', 'subscriptionStartDate', { type: Sequelize.DATE, allowNull: true });
    await add('SchoolPaymentRequests', 'subscriptionEndDate', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query("UPDATE \"SchoolCalendars\" SET \"visibility\" = COALESCE(NULLIF(\"visibility\", ''), NULLIF(\"audience\", ''), CASE WHEN COALESCE(\"isPublic\", false) = true THEN 'whole_school' ELSE 'personal' END) WHERE \"visibility\" IS NULL").catch(() => null);
  },
  async down(queryInterface) {
    // Non-destructive rollback intentionally omitted for live stabilization.
  }
};
