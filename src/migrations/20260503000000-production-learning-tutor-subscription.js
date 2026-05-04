'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = name => tables.includes(name);

    if (!has('LearningMaterials')) {
      await queryInterface.createTable('LearningMaterials', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        schoolCode: { type: Sequelize.STRING, allowNull: true },
        curriculum: { type: Sequelize.ENUM('cbc', '844', 'british', 'american'), defaultValue: 'cbc' },
        gradeLevel: { type: Sequelize.STRING, allowNull: false },
        subject: { type: Sequelize.STRING, allowNull: false },
        strand: Sequelize.STRING,
        subStrand: Sequelize.STRING,
        title: { type: Sequelize.STRING, allowNull: false },
        summary: { type: Sequelize.TEXT, allowNull: false },
        content: { type: Sequelize.TEXT, allowNull: false },
        examples: { type: Sequelize.JSONB, defaultValue: [] },
        activities: { type: Sequelize.JSONB, defaultValue: [] },
        assessment: { type: Sequelize.JSONB, defaultValue: [] },
        difficulty: { type: Sequelize.ENUM('foundation', 'developing', 'proficient', 'advanced'), defaultValue: 'developing' },
        accessLevel: { type: Sequelize.ENUM('basic', 'premium', 'ultimate'), defaultValue: 'basic' },
        sourceType: { type: Sequelize.ENUM('system', 'school', 'teacher'), defaultValue: 'system' },
        resourceUrl: Sequelize.STRING,
        tags: { type: Sequelize.JSONB, defaultValue: [] },
        isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('LearningMaterials', ['curriculum', 'gradeLevel', 'subject']);
      await queryInterface.addIndex('LearningMaterials', ['schoolCode']);
    }

    if (!has('TutorSessions')) {
      await queryInterface.createTable('TutorSessions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' }, onDelete: 'CASCADE' },
        userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
        schoolCode: { type: Sequelize.STRING, allowNull: false },
        subject: { type: Sequelize.STRING, allowNull: false },
        gradeLevel: { type: Sequelize.STRING, allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        status: { type: Sequelize.ENUM('active', 'closed'), defaultValue: 'active' },
        metrics: { type: Sequelize.JSONB, defaultValue: { messages: 0, questionsAsked: 0, confidence: 0 } },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('TutorSessions', ['studentId', 'subject']);
    }

    if (!has('TutorMessages')) {
      await queryInterface.createTable('TutorMessages', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        sessionId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'TutorSessions', key: 'id' }, onDelete: 'CASCADE' },
        studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' }, onDelete: 'CASCADE' },
        role: { type: Sequelize.ENUM('student', 'tutor', 'system'), allowNull: false },
        subject: { type: Sequelize.STRING, allowNull: false },
        content: { type: Sequelize.TEXT, allowNull: false },
        intent: Sequelize.STRING,
        confidence: { type: Sequelize.FLOAT, defaultValue: 0 },
        metadata: { type: Sequelize.JSONB, defaultValue: {} },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('TutorMessages', ['studentId', 'subject']);
    }

    if (!has('TutorInsights')) {
      await queryInterface.createTable('TutorInsights', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        studentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' }, onDelete: 'CASCADE' },
        schoolCode: { type: Sequelize.STRING, allowNull: false },
        subject: { type: Sequelize.STRING, allowNull: false },
        gradeLevel: { type: Sequelize.STRING, allowNull: false },
        masteryScore: { type: Sequelize.INTEGER, defaultValue: 0 },
        strengthAreas: { type: Sequelize.JSONB, defaultValue: [] },
        weakAreas: { type: Sequelize.JSONB, defaultValue: [] },
        recommendedMaterials: { type: Sequelize.JSONB, defaultValue: [] },
        recommendedActivities: { type: Sequelize.JSONB, defaultValue: [] },
        lastInteractionAt: Sequelize.DATE,
        evidence: { type: Sequelize.JSONB, defaultValue: {} },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('TutorInsights', ['studentId', 'subject'], { unique: true });
    }

    if (!has('LegalDocuments')) {
      await queryInterface.createTable('LegalDocuments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        type: { type: Sequelize.ENUM('terms', 'privacy', 'school_dpa', 'child_data_consent'), allowNull: false },
        version: { type: Sequelize.STRING, allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        content: { type: Sequelize.TEXT, allowNull: false },
        effectiveAt: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('LegalDocuments', ['type', 'version'], { unique: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('LegalDocuments');
    await queryInterface.dropTable('TutorInsights');
    await queryInterface.dropTable('TutorMessages');
    await queryInterface.dropTable('TutorSessions');
    await queryInterface.dropTable('LearningMaterials');
  }
};
