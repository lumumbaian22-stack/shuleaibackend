// migrations/20240322000000-fix-alerts-role-null.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, update any existing NULL values to a default value
    await queryInterface.sequelize.query(`
      UPDATE "Alerts" 
      SET "role" = 'admin' 
      WHERE "role" IS NULL;
    `);

    // Now alter the column to NOT NULL
    await queryInterface.changeColumn('Alerts', 'role', {
      type: Sequelize.ENUM('student', 'parent', 'teacher', 'admin'),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Alerts', 'role', {
      type: Sequelize.ENUM('student', 'parent', 'teacher', 'admin'),
      allowNull: true
    });
  }
};
