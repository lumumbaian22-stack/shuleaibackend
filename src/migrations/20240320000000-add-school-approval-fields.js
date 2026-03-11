'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add shortCode to Schools
    await queryInterface.addColumn('Schools', 'shortCode', {
      type: Sequelize.STRING,
      unique: true
    });
    
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
    
    // Make schoolCode nullable for super admin
    await queryInterface.changeColumn('Users', 'schoolCode', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    // Add indexes for performance
    await queryInterface.addIndex('Schools', ['shortCode']);
    await queryInterface.addIndex('Schools', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Schools', 'shortCode');
    await queryInterface.removeColumn('Schools', 'status');
    await queryInterface.removeColumn('Schools', 'approvedBy');
    await queryInterface.removeColumn('Schools', 'approvedAt');
    await queryInterface.removeColumn('Schools', 'rejectionReason');
    
    await queryInterface.changeColumn('Users', 'schoolCode', {
      type: Sequelize.STRING,
      allowNull: false
    });
    
    await queryInterface.removeIndex('Schools', ['shortCode']);
    await queryInterface.removeIndex('Schools', ['status']);
  }
};
