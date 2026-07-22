'use strict';

const { reconcileModels } = require('./lib/canonical-model-reconciler');

module.exports = {
  async up(queryInterface, Sequelize) {
    const models = queryInterface.sequelize.modelManager.models;
    if (!models.length) throw new Error('Full schema verification cannot run because no Sequelize models are registered');
    await reconcileModels(queryInterface, Sequelize, models);
  },
  async down() {}
};
