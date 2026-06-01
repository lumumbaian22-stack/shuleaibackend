-- V105 emergency Render SQL: fixes login crash "column trialEndsAt does not exist".
-- Safe additive schema only; it does not delete or overwrite school data.
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotFullAccessEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotStartedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEndsAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEnabledBy" INTEGER;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialAccessEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmed" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentAmount" INTEGER;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentReference" VARCHAR(255);
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedBy" INTEGER;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(255) NOT NULL DEFAULT 'free';
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(255) NOT NULL DEFAULT 'inactive';
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessMode" VARCHAR(255) NOT NULL DEFAULT 'default';
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessStatus" VARCHAR(255) NOT NULL DEFAULT 'limited';
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "schoolStructure" VARCHAR(255) NOT NULL DEFAULT 'mixed';
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "enabledLevels" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "curriculumVersion" VARCHAR(255);
ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255);
ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelCode" VARCHAR(255);
ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelLabel" VARCHAR(255);
ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculumLevel" VARCHAR(255);

CREATE TABLE IF NOT EXISTS "SchoolPaymentRequests" (
  "id" SERIAL PRIMARY KEY,
  "schoolCode" VARCHAR(255) NOT NULL,
  "submittedBy" INTEGER,
  "amount" INTEGER DEFAULT 0,
  "currency" VARCHAR(255) DEFAULT 'KES',
  "method" VARCHAR(255) DEFAULT 'mpesa',
  "reference" VARCHAR(255),
  "paidAt" TIMESTAMP WITH TIME ZONE,
  "notes" TEXT,
  "proofUrl" TEXT,
  "requestedPlan" VARCHAR(255) DEFAULT 'growth',
  "status" VARCHAR(255) DEFAULT 'pending',
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMP WITH TIME ZONE,
  "reviewNotes" TEXT,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "StudentSubjectSelections" (
  "id" SERIAL PRIMARY KEY,
  "schoolCode" VARCHAR(255) NOT NULL,
  "studentId" INTEGER NOT NULL,
  "classId" INTEGER,
  "subjectId" VARCHAR(255),
  "subjectName" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) DEFAULT 'taking',
  "pathway" VARCHAR(255),
  "track" VARCHAR(255),
  "isCompulsory" BOOLEAN DEFAULT FALSE,
  "isElective" BOOLEAN DEFAULT TRUE,
  "requestedBy" INTEGER,
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMP WITH TIME ZONE,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "PlatformAuditEvents" (
  "id" SERIAL PRIMARY KEY,
  "schoolCode" VARCHAR(255),
  "actorUserId" INTEGER,
  "actorRole" VARCHAR(255),
  "module" VARCHAR(255),
  "action" VARCHAR(255),
  "entityType" VARCHAR(255),
  "entityId" VARCHAR(255),
  "before" JSONB DEFAULT '{}'::jsonb,
  "after" JSONB DEFAULT '{}'::jsonb,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_school_payment_requests_school_status" ON "SchoolPaymentRequests" ("schoolCode", "status");
CREATE INDEX IF NOT EXISTS "idx_student_subject_selections_school_student" ON "StudentSubjectSelections" ("schoolCode", "studentId");
CREATE INDEX IF NOT EXISTS "idx_platform_audit_school_created" ON "PlatformAuditEvents" ("schoolCode", "createdAt");
