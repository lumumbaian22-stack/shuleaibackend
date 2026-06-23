'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    // Remove/neutralize wrongly targeted admin career alerts created by previous builds.
    // Career path alerts are child-scoped and should only go to the student, linked parents,
    // and subject teachers for the student's class/career subjects.
    await sequelize.query(`
      UPDATE "Alerts"
         SET "isRead" = TRUE,
             "readAt" = COALESCE("readAt", NOW()),
             "data" = COALESCE("data", '{}'::jsonb) || jsonb_build_object('hiddenByV97', true, 'reason', 'career alerts are not admin-scoped')
       WHERE LOWER(COALESCE("type"::text,'')) = 'career'
         AND "studentId" IS NOT NULL
         AND LOWER(COALESCE("role"::text,'')) IN ('admin','super_admin','superadmin')
    `).catch(() => null);

    await sequelize.query(`CREATE INDEX IF NOT EXISTS "alerts_user_student_type_idx" ON "Alerts" ("userId", "studentId", "type")`).catch(() => null);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "student_career_school_student_idx" ON "StudentCareerInterests" ("schoolCode", "studentId", "isActive")`).catch(() => null);
  },

  async down() {
    // No destructive rollback for alert cleanup.
  }
};
