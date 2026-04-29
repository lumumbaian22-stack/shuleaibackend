'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // Fix NULL school codes
    await queryInterface.sequelize.query(`
      UPDATE "Users"
      SET "schoolCode" = 'SUPER-ADMIN'
      WHERE "schoolCode" IS NULL AND "role" = 'super_admin';
    `);

    await queryInterface.sequelize.query(`
      UPDATE "Users"
      SET "schoolCode" = 'TEMP-' || id
      WHERE "schoolCode" IS NULL;
    `);

    // Add new columns
    await queryInterface.addColumn('Schools', 'shortCode', {
      type: Sequelize.STRING,
      unique: true
    });

    await queryInterface.addColumn('Schools', 'status', {
      type: Sequelize.ENUM('pending','active','suspended','rejected'),
      defaultValue: 'pending'
    });

    await queryInterface.addColumn('Schools', 'approvedBy', {
      type: Sequelize.INTEGER,
      references: { model: 'Users', key: 'id' },
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Schools', 'approvedAt', {
      type: Sequelize.DATE
    });

    await queryInterface.addColumn('Schools', 'rejectionReason', {
      type: Sequelize.TEXT
    });

    // Generate unique short codes
    await queryInterface.sequelize.query(`
      UPDATE "Schools"
      SET "shortCode" = 'SHL-' || id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT),1,3))
      WHERE "shortCode" IS NULL;
    `);

    await queryInterface.addIndex('Schools', ['shortCode']);
    await queryInterface.addIndex('Schools', ['status']);
  },

  down: async (queryInterface, Sequelize) => {

    await queryInterface.removeIndex('Schools', ['shortCode']);
    await queryInterface.removeIndex('Schools', ['status']);

    await queryInterface.removeColumn('Schools', 'shortCode');
    await queryInterface.removeColumn('Schools', 'status');
    await queryInterface.removeColumn('Schools', 'approvedBy');
    await queryInterface.removeColumn('Schools', 'approvedAt');
    await queryInterface.removeColumn('Schools', 'rejectionReason');

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Schools_status";'
    );
  }
};
