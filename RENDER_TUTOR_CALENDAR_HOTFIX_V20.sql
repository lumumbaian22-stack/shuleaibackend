-- Shule AI v20 Render/Postgres hotfix
-- Fixes: relation "TutorUsages" does not exist, relation "TutorProgresses" does not exist,
-- and makes academic calendar events persist school-wide with flexible event types.

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS "TutorUsages" (
  "id" SERIAL PRIMARY KEY,
  "schoolId" VARCHAR(255) NOT NULL,
  "studentId" INTEGER NOT NULL,
  "usageDate" DATE NOT NULL,
  "totalQuestions" INTEGER DEFAULT 0,
  "aiCalls" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

ALTER TABLE "TutorMessages" ALTER COLUMN "role" TYPE VARCHAR(255) USING "role"::text;
ALTER TABLE "SchoolCalendars" ALTER COLUMN "eventType" TYPE VARCHAR(255) USING "eventType"::text;

ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "term" VARCHAR(255);
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "time" VARCHAR(255);
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "location" VARCHAR(255);
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "audience" VARCHAR(255) DEFAULT 'whole_school';
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tutor_messages_school_student_created ON "TutorMessages" ("schoolId", "studentId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_progress_unique_school_student_subject_topic ON "TutorProgresses" ("schoolId", "studentId", "subject", "topic");
CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_usage_unique_school_student_date ON "TutorUsages" ("schoolId", "studentId", "usageDate");
CREATE INDEX IF NOT EXISTS idx_school_calendar_school_date ON "SchoolCalendars" ("schoolId", "startDate");
