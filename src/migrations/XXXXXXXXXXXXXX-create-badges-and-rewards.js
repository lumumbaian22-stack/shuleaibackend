'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Badges table
    await queryInterface.createTable('Badges', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT },
      icon: { type: Sequelize.STRING }, // emoji or icon name
      category: { type: Sequelize.ENUM('academic','attendance','behavior','extracurricular','other'), defaultValue: 'other' },
      requiredPoints: { type: Sequelize.INTEGER, defaultValue: 0 },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    // StudentBadges junction
    await queryInterface.createTable('StudentBadges', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
      badgeId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Badges', key: 'id' } },
      awardedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    // Rewards store
    await queryInterface.createTable('Rewards', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT },
      pointsCost: { type: Sequelize.INTEGER, allowNull: false },
      quantity: { type: Sequelize.INTEGER, defaultValue: -1 }, // -1 = unlimited
      schoolId: { type: Sequelize.STRING, allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });

    // StudentRewards (purchases)
    await queryInterface.createTable('StudentRewards', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
      rewardId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Rewards', key: 'id' } },
      pointsSpent: { type: Sequelize.INTEGER, allowNull: false },
      redeemedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('StudentRewards');
    await queryInterface.dropTable('Rewards');
    await queryInterface.dropTable('StudentBadges');
    await queryInterface.dropTable('Badges');
  }
};
