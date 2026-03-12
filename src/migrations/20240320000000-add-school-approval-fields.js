'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // FIRST: Update existing super admin users to have a placeholder
    await queryInterface.sequelize.query(`
      UPDATE "Users" 
      SET "schoolCode" = 'SUPER-ADMIN' 
      WHERE role = 'super_admin' AND "schoolCode" IS NULL;
    `);

    // THEN: Add shortCode to Schools
    await queryInterface.addColumn('Schools', 'shortCode', {
      type: Sequelize.STRING,
      unique: true
    });
    
    // Generate short codes for existing schools
    await queryInterface.sequelize.query(`
      UPDATE "Schools" 
      SET "shortCode" = 'SHL-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 5))
      WHERE "shortCode" IS NULL;
    `);
    
    // Add status field to Schools
    await queryInterface.addColumn('Schools', 'status', {
      type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
      defaultValue: 'pending'
    });
    
    // Add approval fields to Schools
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
    
    // NOW it's safe to make schoolCode NOT NULL and add foreign key
    // First ensure no NULLs remain
    await queryInterface.sequelize.query(`
      UPDATE "Users" 
      SET "schoolCode" = 'SUPER-ADMIN' 
      WHERE "schoolCode" IS NULL;
    `);
    
    // Then alter column
    await queryInterface.changeColumn('Users', 'schoolCode', {
      type: Sequelize.STRING,
      allowNull: false
    });
    
    // Add foreign key constraint
    await queryInterface.addConstraint('Users', {
      fields: ['schoolCode'],
      type: 'foreign key',
      name: 'Users_schoolCode_fkey',
      references: {
        table: 'Schools',
        field: 'schoolId'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    
    // Add indexes
    await queryInterface.addIndex('Schools', ['shortCode']);
    await queryInterface.addIndex('Schools', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove foreign key first
    await queryInterface.removeConstraint('Users', 'Users_schoolCode_fkey');
    
    // Make schoolCode nullable again
    await queryInterface.changeColumn('Users', 'schoolCode', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.removeColumn('Schools', 'shortCode');
    await queryInterface.removeColumn('Schools', 'status');
    await queryInterface.removeColumn('Schools', 'approvedBy');
    await queryInterface.removeColumn('Schools', 'approvedAt');
    await queryInterface.removeColumn('Schools', 'rejectionReason');
    
    await queryInterface.removeIndex('Schools', ['shortCode']);
    await queryInterface.removeIndex('Schools', ['status']);
  }
};
