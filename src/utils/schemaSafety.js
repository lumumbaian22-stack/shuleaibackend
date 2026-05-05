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


async function createTableIfMissing(tableName, ddl) {
  if (await tableExists(tableName)) return;
  console.warn(`[schemaSafety] Creating missing table "${tableName}"`);
  await sequelize.query(ddl);
}

async function addIndexIfMissing(indexName, ddl) {
  const result = await sequelize.query(
    `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :indexName) AS exists`,
    { replacements: { indexName }, type: QueryTypes.SELECT }
  );
  if (result[0]?.exists) return;
  console.warn(`[schemaSafety] Creating missing index "${indexName}"`);
  await sequelize.query(ddl);
}

async function ensureTutorTables() {
  await createTableIfMissing('TutorSessions', `
    CREATE TABLE IF NOT EXISTS "TutorSessions" (
      "id" SERIAL PRIMARY KEY,
      "schoolId" VARCHAR(255) NOT NULL,
      "studentId" INTEGER NOT NULL,
      "userId" INTEGER,
      "grade" VARCHAR(255),
      "level" VARCHAR(255),
      "subject" VARCHAR(255),
      "mode" VARCHAR(255) NOT NULL DEFAULT 'learn',
      "lastCommand" VARCHAR(255),
      "metadata" JSONB DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await createTableIfMissing('TutorMessages', `
    CREATE TABLE IF NOT EXISTS "TutorMessages" (
      "id" SERIAL PRIMARY KEY,
      "schoolId" VARCHAR(255) NOT NULL,
      "sessionId" INTEGER,
      "studentId" INTEGER NOT NULL,
      "userId" INTEGER,
      "role" VARCHAR(255) NOT NULL,
      "message" TEXT NOT NULL,
      "subject" VARCHAR(255),
      "topic" VARCHAR(255),
      "command" VARCHAR(255),
      "source" VARCHAR(255),
      "metadata" JSONB DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await createTableIfMissing('TutorProgresses', `
    CREATE TABLE IF NOT EXISTS "TutorProgresses" (
      "id" SERIAL PRIMARY KEY,
      "schoolId" VARCHAR(255) NOT NULL,
      "studentId" INTEGER NOT NULL,
      "grade" VARCHAR(255),
      "level" VARCHAR(255),
      "subject" VARCHAR(255) NOT NULL,
      "topic" VARCHAR(255) NOT NULL DEFAULT 'General',
      "attempts" INTEGER DEFAULT 0,
      "correct" INTEGER DEFAULT 0,
      "lastCommand" VARCHAR(255),
      "lastSource" VARCHAR(255),
      "lastStudiedAt" TIMESTAMPTZ,
      "metadata" JSONB DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await createTableIfMissing('TutorUsages', `
    CREATE TABLE IF NOT EXISTS "TutorUsages" (
      "id" SERIAL PRIMARY KEY,
      "schoolId" VARCHAR(255) NOT NULL,
      "studentId" INTEGER NOT NULL,
      "usageDate" DATE NOT NULL,
      "totalQuestions" INTEGER DEFAULT 0,
      "aiCalls" INTEGER DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await addIndexIfMissing('idx_tutor_messages_school_student_created', 'CREATE INDEX idx_tutor_messages_school_student_created ON "TutorMessages" ("schoolId", "studentId", "createdAt")');
  await addIndexIfMissing('idx_tutor_progress_unique_school_student_subject_topic', 'CREATE UNIQUE INDEX idx_tutor_progress_unique_school_student_subject_topic ON "TutorProgresses" ("schoolId", "studentId", "subject", "topic")');
  await addIndexIfMissing('idx_tutor_usage_unique_school_student_date', 'CREATE UNIQUE INDEX idx_tutor_usage_unique_school_student_date ON "TutorUsages" ("schoolId", "studentId", "usageDate")');
}

async function ensureSchoolCalendarTable() {
  await createTableIfMissing('SchoolCalendars', `
    CREATE TABLE IF NOT EXISTS "SchoolCalendars" (
      "id" SERIAL PRIMARY KEY,
      "schoolId" VARCHAR(255) NOT NULL,
      "eventType" VARCHAR(255) NOT NULL DEFAULT 'other',
      "eventName" VARCHAR(255) NOT NULL,
      "term" VARCHAR(255),
      "year" INTEGER,
      "description" TEXT,
      "startDate" DATE NOT NULL,
      "endDate" DATE,
      "time" VARCHAR(255),
      "location" VARCHAR(255),
      "audience" VARCHAR(255) NOT NULL DEFAULT 'whole_school',
      "isPublic" BOOLEAN DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  // Older DBs used enum_TutorMessages_role and enum_SchoolCalendars_eventType. Convert to VARCHAR so new commands/event types don't crash.
  if (await tableExists('TutorMessages') && await columnExists('TutorMessages', 'role')) {
    await sequelize.query('ALTER TABLE "TutorMessages" ALTER COLUMN "role" TYPE VARCHAR(255) USING "role"::text');
  }
  if (await tableExists('SchoolCalendars') && await columnExists('SchoolCalendars', 'eventType')) {
    await sequelize.query('ALTER TABLE "SchoolCalendars" ALTER COLUMN "eventType" TYPE VARCHAR(255) USING "eventType"::text');
  }

  await addColumnIfMissing('SchoolCalendars', 'term', 'VARCHAR(255)');
  await addColumnIfMissing('SchoolCalendars', 'year', 'INTEGER');
  await addColumnIfMissing('SchoolCalendars', 'description', 'TEXT');
  await addColumnIfMissing('SchoolCalendars', 'time', 'VARCHAR(255)');
  await addColumnIfMissing('SchoolCalendars', 'location', 'VARCHAR(255)');
  await addColumnIfMissing('SchoolCalendars', 'audience', "VARCHAR(255) DEFAULT 'whole_school'");
  await addColumnIfMissing('SchoolCalendars', 'createdAt', 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
  await addColumnIfMissing('SchoolCalendars', 'updatedAt', 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
  await addIndexIfMissing('idx_school_calendar_school_date', 'CREATE INDEX idx_school_calendar_school_date ON "SchoolCalendars" ("schoolId", "startDate")');
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

  await ensureSchoolCalendarTable();
  await ensureTutorTables();

  await addColumnIfMissing('Timetables', 'term', 'VARCHAR(255)');
  await addColumnIfMissing('Timetables', 'year', 'INTEGER');
  await addColumnIfMissing('Timetables', 'scope', "VARCHAR(255) DEFAULT 'term'");
  await addColumnIfMissing('Timetables', 'classes', "JSONB DEFAULT '[]'::jsonb");
  await addColumnIfMissing('Timetables', 'warnings', "JSONB DEFAULT '[]'::jsonb");

  
  const timestampTables = [
    'HomeTasks', 'HomeTaskAssignments', 'MoodCheckins',
    'Badges', 'Rewards', 'StudentBadges', 'StudentRewards',
    'SchoolCalendars', 'Timetables', 'StudentCompetencyProgresses',
    'Competencies', 'LearningOutcomes'
  ];
  for (const table of timestampTables) {
    await addColumnIfMissing(table, 'createdAt', 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    await addColumnIfMissing(table, 'updatedAt', 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
  }

  console.log('[schemaSafety] Runtime schema check complete');
}

module.exports = { ensureRuntimeSchema };