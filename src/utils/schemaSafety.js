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

async function addIndexIfMissing(indexName, ddl, requirements = {}) {
  const result = await sequelize.query(
    `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :indexName) AS exists`,
    { replacements: { indexName }, type: QueryTypes.SELECT }
  );
  if (result[0]?.exists) return;

  if (requirements.table && Array.isArray(requirements.columns)) {
    if (!(await tableExists(requirements.table))) {
      console.warn(`[schemaSafety] Cannot create index "${indexName}" because table "${requirements.table}" is missing; skipping`);
      return;
    }
    const missing = [];
    for (const column of requirements.columns) {
      if (!(await columnExists(requirements.table, column))) missing.push(column);
    }
    if (missing.length) {
      console.warn(`[schemaSafety] Cannot create index "${indexName}" because columns are missing on "${requirements.table}": ${missing.join(', ')}; skipping safely`);
      return;
    }
  }

  try {
    console.warn(`[schemaSafety] Creating missing index "${indexName}"`);
    await sequelize.query(ddl);
  } catch (err) {
    const msg = String(err?.original?.message || err?.message || err);
    if (msg.includes('already exists') || msg.includes('does not exist') || msg.includes('column')) {
      console.warn(`[schemaSafety] Skipped index "${indexName}" safely: ${msg}`);
      return;
    }
    throw err;
  }
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

  // Repair partially-created tutor tables before creating indexes. This is required for Render DBs
  // where an older deployment created the table without the newer columns.
  await addColumnIfMissing('TutorSessions', 'schoolId', "VARCHAR(255) NOT NULL DEFAULT 'default-school'");
  await addColumnIfMissing('TutorSessions', 'studentId', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('TutorSessions', 'userId', 'INTEGER');
  await addColumnIfMissing('TutorSessions', 'grade', 'VARCHAR(255)');
  await addColumnIfMissing('TutorSessions', 'level', 'VARCHAR(255)');
  await addColumnIfMissing('TutorSessions', 'subject', 'VARCHAR(255)');
  await addColumnIfMissing('TutorSessions', 'mode', "VARCHAR(255) NOT NULL DEFAULT 'learn'");
  await addColumnIfMissing('TutorSessions', 'lastCommand', 'VARCHAR(255)');
  await addColumnIfMissing('TutorSessions', 'metadata', "JSONB DEFAULT '{}'::jsonb");
  await addColumnIfMissing('TutorSessions', 'createdAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await addColumnIfMissing('TutorSessions', 'updatedAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await addColumnIfMissing('TutorMessages', 'schoolId', "VARCHAR(255) NOT NULL DEFAULT 'default-school'");
  await addColumnIfMissing('TutorMessages', 'sessionId', 'INTEGER');
  await addColumnIfMissing('TutorMessages', 'studentId', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('TutorMessages', 'userId', 'INTEGER');
  await addColumnIfMissing('TutorMessages', 'role', "VARCHAR(255) NOT NULL DEFAULT 'student'");
  await addColumnIfMissing('TutorMessages', 'message', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('TutorMessages', 'subject', 'VARCHAR(255)');
  await addColumnIfMissing('TutorMessages', 'topic', 'VARCHAR(255)');
  await addColumnIfMissing('TutorMessages', 'command', 'VARCHAR(255)');
  await addColumnIfMissing('TutorMessages', 'source', 'VARCHAR(255)');
  await addColumnIfMissing('TutorMessages', 'metadata', "JSONB DEFAULT '{}'::jsonb");
  await addColumnIfMissing('TutorMessages', 'createdAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await addColumnIfMissing('TutorMessages', 'updatedAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await addColumnIfMissing('TutorProgresses', 'schoolId', "VARCHAR(255) NOT NULL DEFAULT 'default-school'");
  await addColumnIfMissing('TutorProgresses', 'studentId', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('TutorProgresses', 'grade', 'VARCHAR(255)');
  await addColumnIfMissing('TutorProgresses', 'level', 'VARCHAR(255)');
  await addColumnIfMissing('TutorProgresses', 'subject', "VARCHAR(255) NOT NULL DEFAULT 'General'");
  await addColumnIfMissing('TutorProgresses', 'topic', "VARCHAR(255) NOT NULL DEFAULT 'General'");
  await addColumnIfMissing('TutorProgresses', 'attempts', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('TutorProgresses', 'correct', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('TutorProgresses', 'lastCommand', 'VARCHAR(255)');
  await addColumnIfMissing('TutorProgresses', 'lastSource', 'VARCHAR(255)');
  await addColumnIfMissing('TutorProgresses', 'lastStudiedAt', 'TIMESTAMPTZ');
  await addColumnIfMissing('TutorProgresses', 'metadata', "JSONB DEFAULT '{}'::jsonb");
  await addColumnIfMissing('TutorProgresses', 'createdAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await addColumnIfMissing('TutorProgresses', 'updatedAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await addColumnIfMissing('TutorUsages', 'schoolId', "VARCHAR(255) NOT NULL DEFAULT 'default-school'");
  await addColumnIfMissing('TutorUsages', 'studentId', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('TutorUsages', 'usageDate', 'DATE NOT NULL DEFAULT CURRENT_DATE');
  await addColumnIfMissing('TutorUsages', 'totalQuestions', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('TutorUsages', 'aiCalls', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('TutorUsages', 'createdAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await addColumnIfMissing('TutorUsages', 'updatedAt', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await addIndexIfMissing('idx_tutor_messages_school_student_created', 'CREATE INDEX idx_tutor_messages_school_student_created ON "TutorMessages" ("schoolId", "studentId", "createdAt")', { table: 'TutorMessages', columns: ['schoolId', 'studentId', 'createdAt'] });
  await addIndexIfMissing('idx_tutor_progress_unique_school_student_subject_topic', 'CREATE UNIQUE INDEX idx_tutor_progress_unique_school_student_subject_topic ON "TutorProgresses" ("schoolId", "studentId", "subject", "topic")', { table: 'TutorProgresses', columns: ['schoolId', 'studentId', 'subject', 'topic'] });
  await addIndexIfMissing('idx_tutor_usage_unique_school_student_date', 'CREATE UNIQUE INDEX idx_tutor_usage_unique_school_student_date ON "TutorUsages" ("schoolId", "studentId", "usageDate")', { table: 'TutorUsages', columns: ['schoolId', 'studentId', 'usageDate'] });
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
  await addIndexIfMissing('idx_school_calendar_school_date', 'CREATE INDEX idx_school_calendar_school_date ON "SchoolCalendars" ("schoolId", "startDate")', { table: 'SchoolCalendars', columns: ['schoolId', 'startDate'] });
}

async function ensureRuntimeSchema() {
  if (process.env.DISABLE_SCHEMA_SAFETY === 'true') {
    console.log('[schemaSafety] Disabled by DISABLE_SCHEMA_SAFETY=true');
    return;
  }

  // V30: hard runtime repair for live Render/Postgres DBs that missed the v29 migration.
  // Sequelize queries "Student" columns with exact quoted camelCase names, so the DB must contain "classId" exactly.
  await addColumnIfMissing('Students', 'classId', 'INTEGER');
  await addColumnIfMissing('Students', 'curriculum', "VARCHAR(255) DEFAULT 'cbc'");
  await addColumnIfMissing('Students', 'admissionNumber', 'VARCHAR(255)');
  await addColumnIfMissing('Fees', 'feeStructureId', 'VARCHAR(255)');
  await addColumnIfMissing('Fees', 'classId', 'INTEGER');
  await addColumnIfMissing('Fees', 'currency', "VARCHAR(255) DEFAULT 'KES'");
  await addColumnIfMissing('Fees', 'locked', 'BOOLEAN DEFAULT false');
  await addColumnIfMissing('Fees', 'auditTrail', "JSONB DEFAULT '[]'::jsonb");
  await addColumnIfMissing('Fees', 'adjustments', "JSONB DEFAULT '[]'::jsonb");
  await addColumnIfMissing('Fees', 'lastReconciledAt', 'TIMESTAMP WITH TIME ZONE');
  await addColumnIfMissing('AcademicRecords', 'classId', 'INTEGER');
  await addColumnIfMissing('Attendance', 'classId', 'INTEGER');

  await addIndexIfMissing('idx_students_class_id_v30', 'CREATE INDEX idx_students_class_id_v30 ON "Students" ("classId")', { table: 'Students', columns: ['classId'] });
  await addIndexIfMissing('idx_fees_class_term_v30', 'CREATE INDEX idx_fees_class_term_v30 ON "Fees" ("schoolCode", "classId", "term", "year")', { table: 'Fees', columns: ['schoolCode', 'classId', 'term', 'year'] });

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


  // V42: keep camelCase classId columns and tutor schoolCode compatibility columns repaired.
  // The live database has previously missed these columns; many dashboards query Students/Fees/Attendance/AcademicRecords.
  await addColumnIfMissing('Students', 'classId', 'INTEGER');
  await addColumnIfMissing('Fees', 'classId', 'INTEGER');
  await addColumnIfMissing('AcademicRecords', 'classId', 'INTEGER');
  await addColumnIfMissing('Attendance', 'classId', 'INTEGER');
  await addColumnIfMissing('ReportSnapshots', 'classId', 'INTEGER');
  await addColumnIfMissing('FeeStructures', 'classId', 'INTEGER');
  await addColumnIfMissing('TutorSessions', 'schoolCode', 'VARCHAR(255)');
  await addColumnIfMissing('TutorMessages', 'schoolCode', 'VARCHAR(255)');
  await addColumnIfMissing('TutorProgresses', 'schoolCode', 'VARCHAR(255)');
  await addColumnIfMissing('TutorUsages', 'schoolCode', 'VARCHAR(255)');
  await sequelize.query("UPDATE \"TutorSessions\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorMessages\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorProgresses\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorUsages\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);



  // V44 organized schema repair: keep model fields and DB columns aligned before any dashboard query runs.
  // This is source-level runtime repair, not a frontend workaround.
  await sequelize.query('ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT \'cbc\'').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255)').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "Teachers" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "FeeStructures" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "ReportSnapshots" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "TutorSessions" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "TutorMessages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "TutorProgresses" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
  await sequelize.query('ALTER TABLE IF EXISTS "TutorUsages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
  await sequelize.query("UPDATE \"TutorSessions\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorMessages\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorProgresses\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  await sequelize.query("UPDATE \"TutorUsages\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);

  console.log('[schemaSafety] Runtime schema check complete');
}

module.exports = { ensureRuntimeSchema };