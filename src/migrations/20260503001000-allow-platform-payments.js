'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Payments', 'studentId', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Students', key: 'id' }, onDelete: 'SET NULL' });
    await queryInterface.changeColumn('Payments', 'parentId', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Parents', key: 'id' }, onDelete: 'SET NULL' });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Payments', 'studentId', { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } });
    await queryInterface.changeColumn('Payments', 'parentId', { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Parents', key: 'id' } });
  }
};
