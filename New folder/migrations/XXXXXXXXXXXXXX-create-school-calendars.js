'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SchoolCalendars', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      eventType: { type: Sequelize.ENUM('term_start', 'term_end', 'holiday', 'exam', 'meeting', 'other'), allowNull: false },
      eventName: { type: Sequelize.STRING, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      isPublic: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('SchoolCalendars');
  }
};
