'use strict';

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`ALTER TABLE IF EXISTS "Teachers" ADD COLUMN IF NOT EXISTS "signature" TEXT`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Teachers" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Admins" ADD COLUMN IF NOT EXISTS "signature" TEXT`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Admins" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT`).catch(() => null);
    await q.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "reportCardSettings" JSONB DEFAULT '{}'::jsonb`).catch(() => null);

    // Keep an explicit default for the final Shule AI report card layout.
    await q.query(`
      UPDATE "Schools"
      SET "reportCardSettings" = COALESCE("reportCardSettings", '{}'::jsonb) || jsonb_build_object(
        'layout', 'one_page_a4',
        'showParentGuardianSignature', false,
        'showChildPhoto', true,
        'showTopLogo', true,
        'showCenterWatermark', true,
        'signatureSlots', jsonb_build_array('class_teacher', 'headteacher_principal')
      )
      WHERE "reportCardSettings" IS NULL
         OR COALESCE("reportCardSettings"->>'layout','') = ''
         OR COALESCE("reportCardSettings"->>'showParentGuardianSignature','') <> 'false'
    `).catch(() => null);
  },
  async down(queryInterface) {
    // Keep data on down to avoid deleting uploaded signatures/report settings.
  }
};
