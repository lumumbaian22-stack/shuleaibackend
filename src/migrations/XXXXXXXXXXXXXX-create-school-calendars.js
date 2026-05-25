'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SchoolCalendars', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      eventType: { type: Sequelize.STRING, allowNull: false, defaultValue: 'other' },
      eventName: { type: Sequelize.STRING, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      term: { type: Sequelize.STRING, allowNull: true },
      year: { type: Sequelize.INTEGER, allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      time: { type: Sequelize.STRING, allowNull: true },
      location: { type: Sequelize.STRING, allowNull: true },
      audience: { type: Sequelize.STRING, allowNull: false, defaultValue: 'whole_school' },
      isPublic: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('SchoolCalendars');
  }
};
