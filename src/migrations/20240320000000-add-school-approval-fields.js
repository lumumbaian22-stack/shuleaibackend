'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, set a placeholder for any NULL schoolCode values
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

    // Now add the new columns to Schools
    await queryInterface.addColumn('Schools', 'shortCode', {
      type: Sequelize.STRING,
      unique: true
    });
    
    await queryInterface.addColumn('Schools', 'status', {
      type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
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
    
    // Generate short codes for existing schools
    await queryInterface.sequelize.query(`
      UPDATE "Schools" 
      SET "shortCode" = 'SHL-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 5))
      WHERE "shortCode" IS NULL;
    `);
    
    // Add indexes
    await queryInterface.addIndex('Schools', ['shortCode']);
    await queryInterface.addIndex('Schools', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Schools', 'shortCode');
    await queryInterface.removeColumn('Schools', 'status');
    await queryInterface.removeColumn('Schools', 'approvedBy');
    await queryInterface.removeColumn('Schools', 'approvedAt');
    await queryInterface.removeColumn('Schools', 'rejectionReason');
    
    await queryInterface.removeIndex('Schools', ['shortCode']);
    await queryInterface.removeIndex('Schools', ['status']);
  }
};
