'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Timetables', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      weekStartDate: { type: Sequelize.DATEONLY, allowNull: false },
      slots: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }, // [ { day: 'monday', periods: [ { subject, teacherId, classId, startTime, endTime } ] } ]
      isPublished: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    });
  },
  down: async (queryInterface) => { await queryInterface.dropTable('Timetables'); }
};
