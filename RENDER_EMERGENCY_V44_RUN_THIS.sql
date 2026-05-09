-- Shule AI v44 emergency production schema repair.
-- Run in Render PostgreSQL if any dashboard still says: column "classId" does not exist.

ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255);
ALTER TABLE IF EXISTS "Teachers" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "FeeStructures" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "ReportSnapshots" ADD COLUMN IF NOT EXISTS "classId" INTEGER;

ALTER TABLE IF EXISTS "TutorSessions" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorMessages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorProgresses" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);
ALTER TABLE IF EXISTS "TutorUsages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255);

UPDATE "TutorSessions" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorMessages" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorProgresses" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;
UPDATE "TutorUsages" SET "schoolCode" = COALESCE("schoolCode", "schoolId", 'default') WHERE "schoolCode" IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_classid_v44 ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS idx_academicrecords_classid_v44 ON "AcademicRecords" ("classId");
CREATE INDEX IF NOT EXISTS idx_attendance_classid_v44 ON "Attendance" ("classId");
