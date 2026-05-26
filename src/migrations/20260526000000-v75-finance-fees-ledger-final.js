'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const qi = queryInterface;
    const add = async (table, column, spec) => {
      try { await qi.addColumn(table, column, spec); }
      catch (e) { if (!String(e.message || '').includes('already exists')) throw e; }
    };
    const sql = async (statement) => {
      try { await qi.sequelize.query(statement); }
      catch (e) {
        const msg = String(e.message || '');
        if (!msg.includes('already exists') && !msg.includes('does not exist')) throw e;
      }
    };
    const index = async (table, fields, name, opts = {}) => {
      try { await qi.addIndex(table, fields, { name, ...opts }); }
      catch (e) { if (!String(e.message || '').includes('already exists')) throw e; }
    };

    // Make the finance ledger flexible enough for cash, bank, card, M-Pesa,
    // bursaries, waivers, discounts and reversals. Existing enum values are
    // preserved by casting to text/varchar.
    await sql('ALTER TABLE "Payments" ALTER COLUMN "method" TYPE VARCHAR(60) USING "method"::text;');
    await sql('ALTER TABLE "Payments" ALTER COLUMN "status" TYPE VARCHAR(60) USING "status"::text;');
    await sql('ALTER TABLE "Payments" ALTER COLUMN "paymentType" TYPE VARCHAR(60) USING "paymentType"::text;');
    await sql('ALTER TABLE "Payments" ALTER COLUMN "paidTo" TYPE VARCHAR(60) USING "paidTo"::text;');

    await add('Payments', 'transactionType', { type: Sequelize.STRING, allowNull: false, defaultValue: 'payment' });
    await add('Payments', 'source', { type: Sequelize.STRING, allowNull: false, defaultValue: 'system' });
    await add('Payments', 'approvedBy', { type: Sequelize.INTEGER, allowNull: true });
    await add('Payments', 'processedBy', { type: Sequelize.INTEGER, allowNull: true });
    await add('Payments', 'paymentDate', { type: Sequelize.DATE, allowNull: true });
    await add('Payments', 'feeStructureId', { type: Sequelize.STRING, allowNull: true });
    await add('Payments', 'receiptUrl', { type: Sequelize.TEXT, allowNull: true });

    await add('Fees', 'parentPaidAmount', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await add('Fees', 'creditAmount', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await add('Fees', 'sourceBreakdown', { type: Sequelize.JSONB, allowNull: false, defaultValue: {} });
    await add('Fees', 'lastTransactionAt', { type: Sequelize.DATE, allowNull: true });

    await add('FeeStructures', 'classIds', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
    await add('FeeStructures', 'assignedClasses', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
    await add('FeeStructures', 'groupKey', { type: Sequelize.STRING, allowNull: true });
    await add('FeeStructures', 'studentsAssigned', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });

    // Backfill parent/credit split from existing paidAmount so old balances remain sane.
    await qi.sequelize.query(`
      UPDATE "Fees"
      SET "parentPaidAmount" = COALESCE(NULLIF("parentPaidAmount", 0), COALESCE("paidAmount", 0)),
          "creditAmount" = COALESCE("creditAmount", 0),
          "sourceBreakdown" = COALESCE("sourceBreakdown", '{}'::jsonb)
    `);

    // Backfill grouped class metadata for legacy fee structures.
    await qi.sequelize.query(`
      UPDATE "FeeStructures"
      SET "classIds" = CASE WHEN "classId" IS NOT NULL THEN jsonb_build_array("classId") ELSE COALESCE("classIds", '[]'::jsonb) END,
          "assignedClasses" = CASE WHEN COALESCE("className", '') <> '' THEN jsonb_build_array(jsonb_build_object('id', "classId", 'name', "className")) ELSE COALESCE("assignedClasses", '[]'::jsonb) END,
          "groupKey" = COALESCE("groupKey", LOWER(CONCAT(COALESCE("schoolCode", ''), ':', COALESCE("name", ''), ':', COALESCE("term", ''), ':', COALESCE("year"::text, ''), ':', COALESCE("curriculum", ''))))
    `);

    await index('Payments', ['schoolCode', 'studentId', 'feeId', 'status'], 'payments_school_student_fee_status_v75_idx');
    await index('Payments', ['schoolCode', 'studentId', 'transactionType'], 'payments_school_student_tx_type_v75_idx');
    await index('Payments', ['schoolCode', 'reference'], 'payments_school_reference_v75_idx');
    await index('Fees', ['schoolCode', 'studentId', 'feeStructureId', 'term', 'year'], 'fees_school_student_structure_term_year_v75_idx');
    await index('FeeStructures', ['schoolCode', 'groupKey'], 'fee_structures_school_group_key_v75_idx');
  },

  async down() {
    // Non-destructive rollout migration.
  }
};
