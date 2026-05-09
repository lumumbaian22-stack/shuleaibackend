-- Shule AI V42 emergency database repair. Run in Render PostgreSQL SQL console if classId/tutor errors continue.
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "ReportSnapshots" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "FeeStructures" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "TutorSessions" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorMessages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorProgresses" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorUsages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
UPDATE "TutorSessions" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorMessages" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorProgresses" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorUsages" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
