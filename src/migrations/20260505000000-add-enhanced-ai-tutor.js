'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TutorSessions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      studentId: { type: Sequelize.INTEGER, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: true },
      grade: { type: Sequelize.STRING, allowNull: true },
      level: { type: Sequelize.STRING, allowNull: true },
      subject: { type: Sequelize.STRING, allowNull: true },
      mode: { type: Sequelize.STRING, allowNull: false, defaultValue: 'learn' },
      lastCommand: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.createTable('TutorMessages', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      sessionId: { type: Sequelize.INTEGER, allowNull: true },
      studentId: { type: Sequelize.INTEGER, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: true },
      role: { type: Sequelize.ENUM('student', 'tutor', 'system'), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      subject: { type: Sequelize.STRING, allowNull: true },
      topic: { type: Sequelize.STRING, allowNull: true },
      command: { type: Sequelize.STRING, allowNull: true },
      source: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.createTable('TutorProgresses', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      studentId: { type: Sequelize.INTEGER, allowNull: false },
      grade: { type: Sequelize.STRING, allowNull: true },
      level: { type: Sequelize.STRING, allowNull: true },
      subject: { type: Sequelize.STRING, allowNull: false },
      topic: { type: Sequelize.STRING, allowNull: false, defaultValue: 'General' },
      attempts: { type: Sequelize.INTEGER, defaultValue: 0 },
      correct: { type: Sequelize.INTEGER, defaultValue: 0 },
      lastCommand: { type: Sequelize.STRING, allowNull: true },
      lastSource: { type: Sequelize.STRING, allowNull: true },
      lastStudiedAt: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.createTable('TutorUsages', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      schoolId: { type: Sequelize.STRING, allowNull: false },
      studentId: { type: Sequelize.INTEGER, allowNull: false },
      usageDate: { type: Sequelize.DATEONLY, allowNull: false },
      totalQuestions: { type: Sequelize.INTEGER, defaultValue: 0 },
      aiCalls: { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('TutorMessages', ['schoolId', 'studentId', 'createdAt']);
    await queryInterface.addIndex('TutorProgresses', ['schoolId', 'studentId', 'subject', 'topic'], { unique: true });
    await queryInterface.addIndex('TutorUsages', ['schoolId', 'studentId', 'usageDate'], { unique: true });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('TutorUsages');
    await queryInterface.dropTable('TutorProgresses');
    await queryInterface.dropTable('TutorMessages');
    await queryInterface.dropTable('TutorSessions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_TutorMessages_role";');
  }
};
