'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      // Close duplicate active enrollments deterministically. History is kept.
      await sequelize.query(`
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY "schoolCode", "studentId"
                   ORDER BY "effectiveFrom" DESC NULLS LAST, id DESC
                 ) AS rn
          FROM "StudentEnrollments"
          WHERE status = 'active'
        )
        UPDATE "StudentEnrollments" e
        SET status = 'historical',
            "effectiveTo" = COALESCE(e."effectiveTo", CURRENT_DATE),
            "endedReason" = COALESCE(e."endedReason", 'v2044_duplicate_active_enrollment_reconciled'),
            metadata = COALESCE(e.metadata, '{}'::jsonb) ||
              jsonb_build_object('v2044Reconciled', true, 'v2044ReconciledAt', NOW()),
            "updatedAt" = NOW()
        FROM ranked r
        WHERE e.id = r.id AND r.rn > 1
      `, { transaction });

      // Create a current enrollment only when the legacy class pointer is valid
      // and belongs to the same school. Ambiguous name-only matches are refused.
      await sequelize.query(`
        INSERT INTO "StudentEnrollments"
          ("schoolCode","studentId","classId","stream","academicYear",status,
           "effectiveFrom","movementType","movementReason",metadata,"createdAt","updatedAt")
        SELECT u."schoolCode", s.id, c.id, c.stream,
               CASE
                 WHEN COALESCE(c."academicYear", '') ~ '^[0-9]{4}$' THEN c."academicYear"::integer
                 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::integer
               END,
               'active',
               COALESCE(s."enrollmentDate"::date, CURRENT_DATE),
               'admission_migration',
               'v2044 canonical enrollment backfill from valid class pointer',
               jsonb_build_object('v2044Backfill', true),
               NOW(), NOW()
        FROM "Students" s
        JOIN "Users" u ON u.id = s."userId" AND u.role = 'student'
        JOIN "Classes" c ON c.id = s."classId"
          AND c."schoolCode" = u."schoolCode"
          AND COALESCE(c."isActive", true) = true
        WHERE COALESCE(s.status::text, 'active') = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM "StudentEnrollments" e
            WHERE e."studentId" = s.id
              AND e."schoolCode" = u."schoolCode"
              AND e.status = 'active'
          )
      `, { transaction });

      // Align compatibility pointers to the one authoritative active enrollment.
      await sequelize.query(`
        WITH current_enrollment AS (
          SELECT DISTINCT ON (e."schoolCode", e."studentId")
                 e.id, e."schoolCode", e."studentId", e."classId", c.name
          FROM "StudentEnrollments" e
          LEFT JOIN "Classes" c
            ON c.id = e."classId" AND c."schoolCode" = e."schoolCode"
          WHERE e.status = 'active'
          ORDER BY e."schoolCode", e."studentId",
                   e."effectiveFrom" DESC NULLS LAST, e.id DESC
        )
        UPDATE "Students" s
        SET "activeEnrollmentId" = ce.id,
            "classId" = ce."classId",
            grade = COALESCE(ce.name, s.grade),
            "schoolCode" = COALESCE(s."schoolCode", ce."schoolCode"),
            "updatedAt" = NOW()
        FROM current_enrollment ce
        WHERE s.id = ce."studentId"
      `, { transaction });

      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          "student_enrollments_one_active_per_school_student"
        ON "StudentEnrollments" ("schoolCode", "studentId")
        WHERE status = 'active'
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "student_enrollments_one_active_per_school_student"
    `);
  }
};
