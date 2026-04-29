'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const add = async (table, column, def) => { const desc = await queryInterface.describeTable(table); if (!desc[column]) await queryInterface.addColumn(table, column, def); };
    for (const [c,t] of Object.entries({ assessmentNumber:Sequelize.STRING, nemisNumber:Sequelize.STRING, location:Sequelize.STRING, parentName:Sequelize.STRING, parentEmail:Sequelize.STRING, parentPhone:Sequelize.STRING, parentRelationship:Sequelize.STRING })) await add('Students', c, { type:t, allowNull:true });
    await add('Students','isPrefect',{ type:Sequelize.BOOLEAN, defaultValue:false });
    await add('Timetables','term',{ type:Sequelize.STRING, allowNull:true }); await add('Timetables','year',{ type:Sequelize.INTEGER, allowNull:true }); await add('Timetables','scope',{ type:Sequelize.STRING, defaultValue:'term' }); await add('Timetables','classes',{ type:Sequelize.JSONB, defaultValue:[] }); await add('Timetables','warnings',{ type:Sequelize.JSONB, defaultValue:[] });
    await add('SchoolCalendars','term',{ type:Sequelize.STRING, allowNull:true }); await add('SchoolCalendars','year',{ type:Sequelize.INTEGER, allowNull:true }); await add('SchoolCalendars','description',{ type:Sequelize.TEXT, allowNull:true });
  },
  async down(queryInterface) {}
};
