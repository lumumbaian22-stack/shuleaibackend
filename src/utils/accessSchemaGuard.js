const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

let accessSchemaPromise = null;

function runtimeSchemaRepairAllowed() {
  return process.env.ALLOW_RUNTIME_SCHEMA_REPAIR === 'true' || process.env.NODE_ENV !== 'production';
}

async function run(statement) {
  await sequelize.query(statement).catch((error) => {
    const message = error?.original?.message || error?.message || String(error);
    console.warn(`[access-schema-guard] skipped/failed: ${message}`);
  });
}

async function columnExists(tableName, columnName) {
  const rows = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = :tableName AND column_name = :columnName
    ) AS exists`,
    { replacements: { tableName, columnName }, type: QueryTypes.SELECT }
  );
  return Boolean(rows?.[0]?.exists);
}

async function tableExists(tableName) {
  const rows = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = :tableName
    ) AS exists`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return Boolean(rows?.[0]?.exists);
}

async function verifySchoolAccessSchema() {
  const required = {
    Schools: ['trialAccessEnabled', 'trialEndsAt', 'subscriptionPlan', 'subscriptionStatus', 'accessMode', 'accessStatus', 'schoolStructure', 'enabledLevels'],
    Classes: ['curriculum', 'levelCode', 'levelLabel', 'curriculumLevel']
  };
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    if (!(await tableExists(table))) {
      missing.push(`${table} table`);
      continue;
    }
    for (const column of columns) {
      if (!(await columnExists(table, column))) missing.push(`${table}.${column}`);
    }
  }
  if (missing.length) {
    const err = new Error(`Schema is not ready. Missing: ${missing.join(', ')}. Run npm run migrate before starting production traffic.`);
    err.status = 503;
    throw err;
  }
  return true;
}

async function repairSchoolAccessSchema() {
  // These fields are required by the School model and login/access checks.
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotFullAccessEnabled" BOOLEAN NOT NULL DEFAULT FALSE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotStartedAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEndsAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEnabledBy" INTEGER');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialAccessEnabled" BOOLEAN NOT NULL DEFAULT FALSE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmed" BOOLEAN NOT NULL DEFAULT FALSE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentAmount" INTEGER');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentReference" VARCHAR(255)');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedBy" INTEGER');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(255) NOT NULL DEFAULT \'free\'');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(255) NOT NULL DEFAULT \'inactive\'');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP WITH TIME ZONE');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessMode" VARCHAR(255) NOT NULL DEFAULT \'default\'');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessStatus" VARCHAR(255) NOT NULL DEFAULT \'limited\'');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "schoolStructure" VARCHAR(255) NOT NULL DEFAULT \'mixed\'');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "enabledLevels" JSONB NOT NULL DEFAULT \'[]\'::jsonb');
  await run('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "curriculumVersion" VARCHAR(255)');
  await run('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255)');
  await run('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelCode" VARCHAR(255)');
  await run('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelLabel" VARCHAR(255)');
  await run('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculumLevel" VARCHAR(255)');
  await run(`CREATE TABLE IF NOT EXISTS "SchoolPaymentRequests" ("id" SERIAL PRIMARY KEY,"schoolCode" VARCHAR(255) NOT NULL,"submittedBy" INTEGER,"amount" INTEGER DEFAULT 0,"currency" VARCHAR(255) DEFAULT 'KES',"method" VARCHAR(255) DEFAULT 'mpesa',"reference" VARCHAR(255),"paidAt" TIMESTAMP WITH TIME ZONE,"notes" TEXT,"proofUrl" TEXT,"requestedPlan" VARCHAR(255) DEFAULT 'growth',"status" VARCHAR(255) DEFAULT 'pending',"reviewedBy" INTEGER,"reviewedAt" TIMESTAMP WITH TIME ZONE,"reviewNotes" TEXT,"metadata" JSONB DEFAULT '{}'::jsonb,"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`);
  await run(`CREATE TABLE IF NOT EXISTS "StudentSubjectSelections" ("id" SERIAL PRIMARY KEY,"schoolCode" VARCHAR(255) NOT NULL,"studentId" INTEGER NOT NULL,"classId" INTEGER,"subjectId" VARCHAR(255),"subjectName" VARCHAR(255) NOT NULL,"status" VARCHAR(255) DEFAULT 'taking',"pathway" VARCHAR(255),"track" VARCHAR(255),"isCompulsory" BOOLEAN DEFAULT FALSE,"isElective" BOOLEAN DEFAULT TRUE,"requestedBy" INTEGER,"approvedBy" INTEGER,"approvedAt" TIMESTAMP WITH TIME ZONE,"metadata" JSONB DEFAULT '{}'::jsonb,"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`);
  await run(`CREATE TABLE IF NOT EXISTS "PlatformAuditEvents" ("id" SERIAL PRIMARY KEY,"schoolCode" VARCHAR(255),"actorUserId" INTEGER,"actorRole" VARCHAR(255),"module" VARCHAR(255),"action" VARCHAR(255),"entityType" VARCHAR(255),"entityId" VARCHAR(255),"before" JSONB DEFAULT '{}'::jsonb,"after" JSONB DEFAULT '{}'::jsonb,"metadata" JSONB DEFAULT '{}'::jsonb,"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`);
  await run('CREATE INDEX IF NOT EXISTS "idx_school_payment_requests_school_status" ON "SchoolPaymentRequests" ("schoolCode", "status")');
  await run('CREATE INDEX IF NOT EXISTS "idx_student_subject_selections_school_student" ON "StudentSubjectSelections" ("schoolCode", "studentId")');
  await run('CREATE INDEX IF NOT EXISTS "idx_platform_audit_school_created" ON "PlatformAuditEvents" ("schoolCode", "createdAt")');
}

async function ensureSchoolAccessSchema() {
  if (process.env.DISABLE_ACCESS_SCHEMA_GUARD === 'true') return;
  if (!accessSchemaPromise) {
    accessSchemaPromise = (async () => {
      if (!runtimeSchemaRepairAllowed()) return verifySchoolAccessSchema();
      await repairSchoolAccessSchema();
      return true;
    })().catch((error) => {
      accessSchemaPromise = null;
      throw error;
    });
  }
  return accessSchemaPromise;
}

async function accessSchemaMiddleware(req, res, next) {
  try {
    await ensureSchoolAccessSchema();
  } catch (error) {
    console.error('[access-schema-guard] schema not ready:', error.message);
    return res.status(error.status || 503).json({
      success: false,
      message: 'School access schema is not ready. Run npm run migrate before production traffic.',
      detail: error.message
    });
  }
  return next();
}

module.exports = { ensureSchoolAccessSchema, accessSchemaMiddleware, verifySchoolAccessSchema, runtimeSchemaRepairAllowed };
