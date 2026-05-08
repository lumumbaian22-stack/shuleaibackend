-- Shule AI V31 emergency analytics/schema hotfix
-- Run this manually in Render PostgreSQL if /api/admin/analytics still says column "classId" does not exist.
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255);
ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_students_class_id_v31 ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS idx_fees_class_term_v31 ON "Fees" ("schoolCode", "classId", "term", "year");
