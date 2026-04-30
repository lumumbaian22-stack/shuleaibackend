'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = async table => {
      try { await queryInterface.describeTable(table); return true; } catch (_) { return false; }
    };
    const add = async (table, col, def) => {
      if (!(await exists(table))) return;
      const desc = await queryInterface.describeTable(table);
      if (!desc[col]) await queryInterface.addColumn(table, col, def);
    };

    await add('Schools', 'platformDisplayName', { type: Sequelize.STRING, allowNull: false, defaultValue: 'ShuleAI School' });
    await add('Schools', 'requestedName', { type: Sequelize.STRING, allowNull: true });
    await add('Schools', 'approvedName', { type: Sequelize.STRING, allowNull: true });
    await add('Schools', 'nameApprovalStatus', { type: Sequelize.STRING, allowNull: false, defaultValue: 'platform' });

    // Protect existing schools: if there is no approvedName, UI should show platformDisplayName.
    await queryInterface.sequelize.query(`
      UPDATE "Schools"
      SET "platformDisplayName" = COALESCE("platformDisplayName", 'ShuleAI School'),
          "nameApprovalStatus" = COALESCE("nameApprovalStatus", CASE WHEN "approvedName" IS NOT NULL THEN 'approved' ELSE 'platform' END)
    `);

    // Curriculum progress fields on subject assignment JSON are optional; no DB schema needed.
  },
  async down() {}
};