-- Shule AI v40: hard production fix for analytics crash on missing quoted camelCase columns.
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255);
ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE IF EXISTS "Attendance" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_students_classid_v40 ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS idx_fees_classid_v40 ON "Fees" ("classId");
CREATE INDEX IF NOT EXISTS idx_academicrecords_classid_v40 ON "AcademicRecords" ("classId");
CREATE INDEX IF NOT EXISTS idx_attendance_classid_v40 ON "Attendance" ("classId");
