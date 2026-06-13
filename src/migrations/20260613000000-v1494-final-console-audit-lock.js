'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = new Set(tables.map(t => (typeof t === 'string' ? t : (t.tableName || t.name))));

    if (names.has('Timetables')) {
      const d = await queryInterface.describeTable('Timetables');
      const add = async (name, spec) => { if (!d[name]) await queryInterface.addColumn('Timetables', name, spec).catch(() => {}); };
      await add('status', { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'draft' });
      await add('version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
      await add('publishedAt', { type: Sequelize.DATE, allowNull: true });
      await add('publishedBy', { type: Sequelize.INTEGER, allowNull: true });
      await add('supersedesId', { type: Sequelize.INTEGER, allowNull: true });
      await add('classes', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
      await add('warnings', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
      await queryInterface.sequelize.query(`UPDATE "Timetables" SET "status" = CASE WHEN COALESCE("isPublished", false) = true THEN 'published' ELSE 'draft' END WHERE "status" IS NULL OR "status" = ''`).catch(() => {});
      await queryInterface.sequelize.query(`UPDATE "Timetables" SET "version" = 1 WHERE "version" IS NULL OR "version" < 1`).catch(() => {});
      await queryInterface.addIndex('Timetables', ['schoolId', 'term', 'year', 'scope', 'isPublished'], { name: 'v1494_timetable_active_lookup' }).catch(() => {});
    }

    // Render's default /uploads folder is ephemeral. Clear known stale signature pointers so the UI/PDF falls back cleanly
    // until the user re-uploads a durable /api/media/:token signature.
    if (names.has('Teachers')) {
      await queryInterface.sequelize.query(`UPDATE "Teachers" SET "signature" = NULL WHERE "signature" LIKE '%/uploads/signatures/%'`).catch(() => {});
      await queryInterface.sequelize.query(`UPDATE "Teachers" SET "signatureUrl" = NULL WHERE "signatureUrl" LIKE '%/uploads/signatures/%'`).catch(() => {});
    }
    if (names.has('Admins')) {
      await queryInterface.sequelize.query(`UPDATE "Admins" SET "signature" = NULL WHERE "signature" LIKE '%/uploads/signatures/%'`).catch(() => {});
      await queryInterface.sequelize.query(`UPDATE "Admins" SET "signatureUrl" = NULL WHERE "signatureUrl" LIKE '%/uploads/signatures/%'`).catch(() => {});
    }
    if (names.has('Users')) {
      await queryInterface.sequelize.query(`UPDATE "Users" SET "preferences" = COALESCE("preferences", '{}'::jsonb) - 'signatureUrl' - 'signatureAbsoluteUrl' - 'signatureFileUrl' - 'signature' WHERE COALESCE("preferences", '{}'::jsonb)::text LIKE '%/uploads/signatures/%'`).catch(() => {});
    }

    if (names.has('ReportSnapshots')) {
      await queryInterface.sequelize.query(`UPDATE "ReportSnapshots" SET "formatVersion" = 'v149.4' WHERE "formatVersion" IS NULL OR "formatVersion" = 'v143' OR "formatVersion" = 'v149'`).catch(() => {});
    }
  },

  async down() {
    // Non-destructive reliability migration. No rollback that deletes school data.
  }
};
