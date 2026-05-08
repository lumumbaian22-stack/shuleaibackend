-- Shule AI V29 emergency DB hotfix
-- Run this on the production PostgreSQL database if migrations are not running on Render.
-- Safe to run multiple times.

ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER NULL;
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255) DEFAULT 'cbc';
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "admissionNumber" VARCHAR(255) NULL;

DO $$ BEGIN
  ALTER TABLE "Students"
  ADD CONSTRAINT "fk_students_classId_classes_id"
  FOREIGN KEY ("classId") REFERENCES "Classes"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_students_class_id_v29" ON "Students" ("classId");
CREATE INDEX IF NOT EXISTS "idx_students_grade_v29" ON "Students" ("grade");

ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "feeStructureId" VARCHAR(255) NULL;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER NULL;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT 'KES';
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN DEFAULT false;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "auditTrail" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "adjustments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Fees" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS "idx_fees_student_term_v29" ON "Fees" ("schoolCode", "studentId", "term", "year");
CREATE INDEX IF NOT EXISTS "idx_fees_class_term_v29" ON "Fees" ("schoolCode", "classId", "term", "year");
