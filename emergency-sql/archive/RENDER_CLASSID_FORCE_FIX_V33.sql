-- Shule AI V33: force repair for analytics classId errors on Render/Postgres
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255);
ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_students_class_id_v33 ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS idx_fees_class_term_v33 ON "Fees" ("schoolCode", "classId", "term", "year");
