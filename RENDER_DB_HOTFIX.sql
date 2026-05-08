-- Shule AI V4 Recovery Schema Patch
-- Run this on the production PostgreSQL database if the app reports missing columns.
-- Safe to run multiple times.

ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "assessmentNumber" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "nemisNumber" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "location" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "parentName" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "parentEmail" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "parentPhone" VARCHAR(255);
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "parentRelationship" VARCHAR(255) DEFAULT 'guardian';
ALTER TABLE "Students" ADD COLUMN IF NOT EXISTS "isPrefect" BOOLEAN DEFAULT false;

ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "term" VARCHAR(255);
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "SchoolCalendars" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Timetables" ADD COLUMN IF NOT EXISTS "term" VARCHAR(255);
ALTER TABLE "Timetables" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "Timetables" ADD COLUMN IF NOT EXISTS "scope" VARCHAR(255) DEFAULT 'term';
ALTER TABLE "Timetables" ADD COLUMN IF NOT EXISTS "classes" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Timetables" ADD COLUMN IF NOT EXISTS "warnings" JSONB DEFAULT '[]'::jsonb;