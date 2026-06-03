'use strict';

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`ALTER TABLE IF EXISTS "StudentParents" ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) DEFAULT 'active'`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "StudentParents" ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) DEFAULT 'manual'`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "StudentParents" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "StudentParents" ADD COLUMN IF NOT EXISTS "verifiedBy" INTEGER`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "StudentParents" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb`).catch(() => null);
    await q.query(`UPDATE "StudentParents" SET "status" = COALESCE("status", 'active') WHERE "status" IS NULL`).catch(() => null);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_studentparents_secure_lookup" ON "StudentParents" ("studentId", "parentId", "status")`).catch(() => null);

    // Remove obviously unsafe links that cross schools or point to missing records. This is the backend safety cleanup.
    await q.query(`
      DELETE FROM "StudentParents" sp
      WHERE NOT EXISTS (SELECT 1 FROM "Students" s WHERE s."id" = sp."studentId")
         OR NOT EXISTS (SELECT 1 FROM "Parents" p WHERE p."id" = sp."parentId")
    `).catch(() => null);
    await q.query(`
      DELETE FROM "StudentParents" sp
      USING "Students" s, "Parents" p, "Users" su, "Users" pu
      WHERE sp."studentId" = s."id"
        AND sp."parentId" = p."id"
        AND su."id" = s."userId"
        AND pu."id" = p."userId"
        AND su."schoolCode" IS DISTINCT FROM pu."schoolCode"
    `).catch(() => null);

    await q.query(`ALTER TABLE IF EXISTS "Alerts" ADD COLUMN IF NOT EXISTS "sourceLabel" VARCHAR(120)`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Alerts" ADD COLUMN IF NOT EXISTS "sourceType" VARCHAR(80)`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Alerts" ADD COLUMN IF NOT EXISTS "categoryLabel" VARCHAR(120)`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Alerts" ADD COLUMN IF NOT EXISTS "targetLabel" VARCHAR(120)`).catch(() => null);

    await q.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "currentPlan" VARCHAR(30) DEFAULT 'starter'`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP WITH TIME ZONE`).catch(() => null);

    await q.query(`ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "assessmentType" VARCHAR(60)`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "assessmentWeight" DECIMAL(6,2)`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "showOnReport" BOOLEAN DEFAULT true`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "countInFinal" BOOLEAN DEFAULT true`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER DEFAULT 0`).catch(() => null);

    await q.query(`CREATE TABLE IF NOT EXISTS "SchoolAssessmentSettings" (
      "id" SERIAL PRIMARY KEY,
      "schoolCode" VARCHAR(255) NOT NULL,
      "assessmentType" VARCHAR(60) NOT NULL,
      "label" VARCHAR(120) NOT NULL,
      "showOnReport" BOOLEAN DEFAULT true,
      "countInFinal" BOOLEAN DEFAULT true,
      "weight" DECIMAL(6,2) DEFAULT 0,
      "displayOrder" INTEGER DEFAULT 0,
      "metadata" JSONB DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE ("schoolCode", "assessmentType")
    )`).catch(() => null);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_school_assessment_settings_school" ON "SchoolAssessmentSettings" ("schoolCode", "displayOrder")`).catch(() => null);
  },
  async down() {}
};
