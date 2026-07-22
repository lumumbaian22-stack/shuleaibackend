'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const models = queryInterface.sequelize.modelManager.models;
    if (!models.length) throw new Error('Full schema verification cannot run because no Sequelize models are registered');

    const tableNameOf = model => {
      const value = model.getTableName();
      return typeof value === 'string' ? value : value.tableName;
    };
    const [schemaRows] = await queryInterface.sequelize.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()`
    );
    const existing = new Set(schemaRows.map(row => String(row.table_name)));
    const columnsByTable = new Map();
    for (const row of schemaRows) {
      if (!columnsByTable.has(String(row.table_name))) columnsByTable.set(String(row.table_name), new Set());
      columnsByTable.get(String(row.table_name)).add(String(row.column_name));
    }

    for (const model of models) {
      const table = tableNameOf(model);
      if (!existing.has(String(table))) {
        await model.sync({ force: false });
        existing.add(String(table));
        columnsByTable.set(String(table), new Set(Object.entries(model.rawAttributes)
          .filter(([, attribute]) => !(attribute.type instanceof Sequelize.VIRTUAL))
          .map(([name, attribute]) => String(attribute.field || name))));
      }

      let presentColumns = columnsByTable.get(String(table)) || new Set();
      for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
        if (attribute.type instanceof Sequelize.VIRTUAL) continue;
        const column = attribute.field || attributeName;
        if (presentColumns.has(column)) continue;
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
        presentColumns.add(column);
      }

      const missing = Object.entries(model.rawAttributes)
        .filter(([, attribute]) => !(attribute.type instanceof Sequelize.VIRTUAL))
        .map(([name, attribute]) => attribute.field || name)
        .filter(column => !presentColumns.has(column));
      if (missing.length) throw new Error(`Full schema verification failed: ${table} is missing ${missing.join(', ')}`);
    }
  },
  async down() {}
};
