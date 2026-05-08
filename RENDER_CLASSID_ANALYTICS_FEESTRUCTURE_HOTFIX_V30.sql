-- Shule AI V30 Render/Postgres hotfix
-- Fixes: column "classId" does not exist in /api/admin/analytics and fee structure finance tables.

ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255);

ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "feeStructureId" VARCHAR(255);
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(255) DEFAULT 'KES';
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN DEFAULT false;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "auditTrail" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "adjustments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_class_id_v30 ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS idx_students_grade_v30 ON "Students" ("grade");
CREATE INDEX IF NOT EXISTS idx_fees_class_term_v30 ON "Fees" ("schoolCode", "classId", "term", "year");
CREATE INDEX IF NOT EXISTS idx_fees_student_term_v30 ON "Fees" ("schoolCode", "studentId", "term", "year");
