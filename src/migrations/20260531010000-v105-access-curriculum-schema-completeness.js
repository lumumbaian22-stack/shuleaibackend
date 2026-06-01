'use strict';

async function addColumnIfMissing(queryInterface, table, column, definition) {
  const desc = await queryInterface.describeTable(table).catch(() => null);
  if (desc && !desc[column]) await queryInterface.addColumn(table, column, definition);
}

async function createTableIfMissing(queryInterface, table, definition) {
  await queryInterface.createTable(table, definition).catch((e) => {
    if (!/already exists/i.test(String(e.message || e))) throw e;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'Schools', 'pilotFullAccessEnabled', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'Schools', 'pilotStartedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'pilotEndsAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'pilotEnabledBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'Schools', 'trialAccessEnabled', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'Schools', 'trialStartedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'trialEndsAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'manualPaymentConfirmed', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'Schools', 'manualPaymentAmount', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'Schools', 'manualPaymentReference', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'Schools', 'manualPaymentConfirmedBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'Schools', 'manualPaymentConfirmedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'subscriptionPlan', { type: Sequelize.STRING, defaultValue: 'free' });
    await addColumnIfMissing(queryInterface, 'Schools', 'subscriptionStatus', { type: Sequelize.STRING, defaultValue: 'inactive' });
    await addColumnIfMissing(queryInterface, 'Schools', 'subscriptionStartedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'subscriptionEndsAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'Schools', 'accessMode', { type: Sequelize.STRING, defaultValue: 'default' });
    await addColumnIfMissing(queryInterface, 'Schools', 'accessStatus', { type: Sequelize.STRING, defaultValue: 'limited' });
    await addColumnIfMissing(queryInterface, 'Schools', 'schoolStructure', { type: Sequelize.STRING, defaultValue: 'mixed' });
    await addColumnIfMissing(queryInterface, 'Schools', 'enabledLevels', { type: Sequelize.JSONB, defaultValue: [] });
    await addColumnIfMissing(queryInterface, 'Schools', 'curriculumVersion', { type: Sequelize.STRING });

    await addColumnIfMissing(queryInterface, 'Classes', 'curriculum', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'Classes', 'levelCode', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'Classes', 'levelLabel', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'Classes', 'curriculumLevel', { type: Sequelize.STRING });

    await addColumnIfMissing(queryInterface, 'TeacherSubjectAssignments', 'schoolSubjectId', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'TeacherSubjectAssignments', 'curriculum', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'TeacherSubjectAssignments', 'levelCode', { type: Sequelize.STRING });

    await createTableIfMissing(queryInterface, 'SchoolPaymentRequests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolCode: { type: Sequelize.STRING, allowNull: false },
      submittedBy: { type: Sequelize.INTEGER },
      amount: { type: Sequelize.INTEGER, defaultValue: 0 },
      currency: { type: Sequelize.STRING, defaultValue: 'KES' },
      method: { type: Sequelize.STRING, defaultValue: 'mpesa' },
      reference: { type: Sequelize.STRING },
      paidAt: { type: Sequelize.DATE },
      notes: { type: Sequelize.TEXT },
      proofUrl: { type: Sequelize.TEXT },
      requestedPlan: { type: Sequelize.STRING, defaultValue: 'growth' },
      status: { type: Sequelize.STRING, defaultValue: 'pending' },
      reviewedBy: { type: Sequelize.INTEGER },
      reviewedAt: { type: Sequelize.DATE },
      reviewNotes: { type: Sequelize.TEXT },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await createTableIfMissing(queryInterface, 'StudentSubjectSelections', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolCode: { type: Sequelize.STRING, allowNull: false },
      studentId: { type: Sequelize.INTEGER, allowNull: false },
      classId: { type: Sequelize.INTEGER },
      subjectId: { type: Sequelize.STRING },
      subjectName: { type: Sequelize.STRING, allowNull: false },
      status: { type: Sequelize.STRING, defaultValue: 'taking' },
      pathway: { type: Sequelize.STRING },
      track: { type: Sequelize.STRING },
      isCompulsory: { type: Sequelize.BOOLEAN, defaultValue: false },
      isElective: { type: Sequelize.BOOLEAN, defaultValue: true },
      requestedBy: { type: Sequelize.INTEGER },
      approvedBy: { type: Sequelize.INTEGER },
      approvedAt: { type: Sequelize.DATE },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await createTableIfMissing(queryInterface, 'PlatformAuditEvents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      schoolCode: { type: Sequelize.STRING },
      actorUserId: { type: Sequelize.INTEGER },
      actorRole: { type: Sequelize.STRING },
      module: { type: Sequelize.STRING },
      action: { type: Sequelize.STRING },
      entityType: { type: Sequelize.STRING },
      entityId: { type: Sequelize.STRING },
      before: { type: Sequelize.JSONB, defaultValue: {} },
      after: { type: Sequelize.JSONB, defaultValue: {} },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Repair partially-created tables too. createTable does not add columns when a table already exists.
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'schoolCode', { type: Sequelize.STRING, allowNull: false, defaultValue: 'UNKNOWN' });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'submittedBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'amount', { type: Sequelize.INTEGER, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'currency', { type: Sequelize.STRING, defaultValue: 'KES' });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'method', { type: Sequelize.STRING, defaultValue: 'mpesa' });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'reference', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'paidAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'notes', { type: Sequelize.TEXT });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'proofUrl', { type: Sequelize.TEXT });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'requestedPlan', { type: Sequelize.STRING, defaultValue: 'growth' });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'status', { type: Sequelize.STRING, defaultValue: 'pending' });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'reviewedBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'reviewedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'reviewNotes', { type: Sequelize.TEXT });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'metadata', { type: Sequelize.JSONB, defaultValue: {} });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'createdAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
    await addColumnIfMissing(queryInterface, 'SchoolPaymentRequests', 'updatedAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });

    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'schoolCode', { type: Sequelize.STRING, allowNull: false, defaultValue: 'UNKNOWN' });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'studentId', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'classId', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'subjectId', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'subjectName', { type: Sequelize.STRING, allowNull: false, defaultValue: 'Subject' });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'status', { type: Sequelize.STRING, defaultValue: 'taking' });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'pathway', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'track', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'isCompulsory', { type: Sequelize.BOOLEAN, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'isElective', { type: Sequelize.BOOLEAN, defaultValue: true });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'requestedBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'approvedBy', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'approvedAt', { type: Sequelize.DATE });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'metadata', { type: Sequelize.JSONB, defaultValue: {} });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'createdAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
    await addColumnIfMissing(queryInterface, 'StudentSubjectSelections', 'updatedAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });

    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'schoolCode', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'actorUserId', { type: Sequelize.INTEGER });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'actorRole', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'module', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'action', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'entityType', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'entityId', { type: Sequelize.STRING });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'before', { type: Sequelize.JSONB, defaultValue: {} });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'after', { type: Sequelize.JSONB, defaultValue: {} });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'metadata', { type: Sequelize.JSONB, defaultValue: {} });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'createdAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
    await addColumnIfMissing(queryInterface, 'PlatformAuditEvents', 'updatedAt', { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });

    await queryInterface.addIndex('SchoolPaymentRequests', ['schoolCode', 'status'], { name: 'school_payment_requests_school_status_idx' }).catch(() => null);
    await queryInterface.addIndex('StudentSubjectSelections', ['schoolCode', 'studentId', 'classId'], { name: 'student_subject_selections_scope_idx' }).catch(() => null);
  },

  async down() {
    // Non-destructive. Keep added columns/tables to protect deployed schools.
  }
};
