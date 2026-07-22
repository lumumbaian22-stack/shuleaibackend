'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const models = queryInterface.sequelize.modelManager.models;
    if (!models.length) throw new Error('Full schema verification cannot run because no Sequelize models are registered');

    const tableNameOf = model => {
      const value = model.getTableName();
      return typeof value === 'string' ? value : value.tableName;
    };
    const existingNames = (await queryInterface.showAllTables()).map(value => typeof value === 'string' ? value : value.tableName || value.table_name);
    const existing = new Set(existingNames.map(String));

    for (const model of models) {
      const table = tableNameOf(model);
      if (!existing.has(String(table))) {
        await model.sync({ force: false });
        existing.add(String(table));
      }

      let description = await queryInterface.describeTable(table);
      for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
        if (attribute.type instanceof Sequelize.VIRTUAL) continue;
        const column = attribute.field || attributeName;
        if (description[column]) continue;
        const definition = {
          type: attribute.type,
          allowNull: attribute.allowNull,
          defaultValue: attribute.defaultValue,
          unique: attribute.unique,
          primaryKey: attribute.primaryKey,
          autoIncrement: attribute.autoIncrement,
          references: attribute.references,
          onUpdate: attribute.onUpdate,
          onDelete: attribute.onDelete
        };
        for (const key of Object.keys(definition)) if (definition[key] === undefined) delete definition[key];
        await queryInterface.addColumn(table, column, definition);
      }

      description = await queryInterface.describeTable(table);
      const missing = Object.entries(model.rawAttributes)
        .filter(([, attribute]) => !(attribute.type instanceof Sequelize.VIRTUAL))
        .map(([name, attribute]) => attribute.field || name)
        .filter(column => !description[column]);
      if (missing.length) throw new Error(`Full schema verification failed: ${table} is missing ${missing.join(', ')}`);
    }
  },
  async down() {}
};
