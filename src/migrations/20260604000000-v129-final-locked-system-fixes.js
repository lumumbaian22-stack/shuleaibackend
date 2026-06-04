'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotFullAccessEnabled" BOOLEAN DEFAULT FALSE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialAccessEnabled" BOOLEAN DEFAULT FALSE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP WITH TIME ZONE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP WITH TIME ZONE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmed" BOOLEAN DEFAULT FALSE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentAmount" INTEGER DEFAULT 0`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentReference" VARCHAR(255)`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(255) DEFAULT 'starter'`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(255) DEFAULT 'inactive'`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP WITH TIME ZONE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP WITH TIME ZONE`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessMode" VARCHAR(255) DEFAULT 'default'`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessStatus" VARCHAR(255) DEFAULT 'limited'`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "schoolStructure" VARCHAR(255) DEFAULT 'mixed'`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "enabledLevels" JSONB DEFAULT '[]'::jsonb`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255)`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelCode" VARCHAR(255)`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelLabel" VARCHAR(255)`);
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculumLevel" VARCHAR(255)`);
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS "SmsOutbox" ("id" SERIAL PRIMARY KEY, "scope" VARCHAR(255), "schoolCode" VARCHAR(255), "createdBy" INTEGER, "provider" VARCHAR(255), "recipientCount" INTEGER DEFAULT 0, "successCount" INTEGER DEFAULT 0, "failedCount" INTEGER DEFAULT 0, "tokensUsed" INTEGER DEFAULT 0, "message" TEXT, "status" VARCHAR(255), "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`);
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_sms_outbox_scope_created" ON "SmsOutbox" ("scope", "createdAt")`);
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS "PlatformAuditEvents" ("id" SERIAL PRIMARY KEY, "schoolCode" VARCHAR(255), "actorUserId" INTEGER, "actorRole" VARCHAR(255), "module" VARCHAR(255), "action" VARCHAR(255), "entityType" VARCHAR(255), "entityId" VARCHAR(255), "before" JSONB DEFAULT '{}'::jsonb, "after" JSONB DEFAULT '{}'::jsonb, "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`);
  },
  async down() {}
};
