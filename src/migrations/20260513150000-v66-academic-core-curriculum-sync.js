'use strict';

async function addColumnIfMissing(queryInterface, table, column, definition) {
  const desc = await queryInterface.describeTable(table).catch(() => null);
  if (desc && !desc[column]) await queryInterface.addColumn(table, column, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'classId', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'curriculum', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'status', { type: Sequelize.STRING, defaultValue: 'draft' });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'isPublished', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'publishedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'publishedBy', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'lockedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'unlockedBy', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'unlockReason', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'version', { type: Sequelize.INTEGER, defaultValue: 1 });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'auditTrail', { type: Sequelize.JSONB, defaultValue: [] });
    await addColumnIfMissing(queryInterface, 'AcademicRecords', 'gradingScale', { type: Sequelize.JSONB, allowNull: true });

    await queryInterface.sequelize.query('CREATE INDEX IF NOT EXISTS academicrecords_school_term_year_idx ON "AcademicRecords" ("schoolCode", "term", "year");');
    await queryInterface.sequelize.query('CREATE INDEX IF NOT EXISTS academicrecords_student_subject_idx ON "AcademicRecords" ("studentId", "subject");');
  },
  async down() {}
};
