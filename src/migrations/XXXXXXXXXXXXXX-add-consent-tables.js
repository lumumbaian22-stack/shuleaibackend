'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('UserConsents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      termsAccepted: { type: Sequelize.BOOLEAN, defaultValue: false },
      privacyAccepted: { type: Sequelize.BOOLEAN, defaultValue: false },
      acceptedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      ipAddress: Sequelize.STRING,
      userAgent: Sequelize.TEXT,
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.createTable('ParentChildConsents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      parentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
      consentGiven: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    await queryInterface.createTable('SchoolDPAs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolId: { type: Sequelize.STRING, allowNull: false, references: { model: 'Schools', key: 'schoolId' } },
      adminId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      accepted: { type: Sequelize.BOOLEAN, defaultValue: false },
      acceptedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      ipAddress: Sequelize.STRING,
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('SchoolDPAs');
    await queryInterface.dropTable('ParentChildConsents');
    await queryInterface.dropTable('UserConsents');
  }
};
