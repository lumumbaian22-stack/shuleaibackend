const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

async function tableExists(tableName) {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = :tableName
    ) AS exists`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return !!result[0]?.exists;
}

async function columnExists(tableName, columnName) {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = :tableName
      AND column_name = :columnName
    ) AS exists`,
    { replacements: { tableName, columnName }, type: QueryTypes.SELECT }
  );
  return !!result[0]?.exists;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (!(await tableExists(tableName))) {
    console.warn(`[schemaSafety] Table "${tableName}" does not exist yet; skipping ${columnName}`);
    return;
  }

  if (await columnExists(tableName, columnName)) return;

  console.warn(`[schemaSafety] Adding missing column "${tableName}"."${columnName}"`);
  await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${ddl}`);
}

async function ensureRuntimeSchema() {
  if (process.env.DISABLE_SCHEMA_SAFETY === 'true') {
    console.log('[schemaSafety] Disabled by DISABLE_SCHEMA_SAFETY=true');
    return;
  }

  await addColumnIfMissing('Students', 'assessmentNumber', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'nemisNumber', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'location', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'parentName', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'parentEmail', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'parentPhone', 'VARCHAR(255)');
  await addColumnIfMissing('Students', 'parentRelationship', "VARCHAR(255) DEFAULT 'guardian'");
  await addColumnIfMissing('Students', 'isPrefect', 'BOOLEAN DEFAULT false');

  await addColumnIfMissing('SchoolCalendars', 'term', 'VARCHAR(255)');
  await addColumnIfMissing('SchoolCalendars', 'year', 'INTEGER');
  await addColumnIfMissing('SchoolCalendars', 'description', 'TEXT');

  await addColumnIfMissing('Timetables', 'term', 'VARCHAR(255)');
  await addColumnIfMissing('Timetables', 'year', 'INTEGER');
  await addColumnIfMissing('Timetables', 'scope', "VARCHAR(255) DEFAULT 'term'");
  await addColumnIfMissing('Timetables', 'classes', "JSONB DEFAULT '[]'::jsonb");
  await addColumnIfMissing('Timetables', 'warnings', "JSONB DEFAULT '[]'::jsonb");

  console.log('[schemaSafety] Runtime schema check complete');
}

module.exports = { ensureRuntimeSchema };