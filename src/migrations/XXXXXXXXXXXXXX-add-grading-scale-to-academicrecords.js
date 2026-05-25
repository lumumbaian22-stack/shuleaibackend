'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('AcademicRecords', 'gradingScale', {
      type: Sequelize.JSONB,
      defaultValue: null
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('AcademicRecords', 'gradingScale');
  }
};
