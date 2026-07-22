'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('Messages');
    if (!columns.schoolCode) await queryInterface.addColumn('Messages', 'schoolCode', { type: Sequelize.STRING, allowNull: true });
    if (!columns.conversationId) await queryInterface.addColumn('Messages', 'conversationId', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.sequelize.query(`
      UPDATE "Messages"
         SET "schoolCode" = COALESCE("schoolCode", NULLIF("metadata"->>'schoolCode', '')),
             "conversationId" = COALESCE("conversationId", NULLIF(COALESCE("metadata"->>'conversationKey', "metadata"->>'conversationId'), ''))
       WHERE "metadata" IS NOT NULL
         AND ("schoolCode" IS NULL OR "conversationId" IS NULL)
    `);

    const indexes = await queryInterface.showIndex('Messages');
    const names = new Set(indexes.map(index => index.name));
    if (!names.has('idx_messages_school_created')) await queryInterface.addIndex('Messages', ['schoolCode', 'createdAt'], { name: 'idx_messages_school_created' });
    if (!names.has('idx_messages_conversation_created')) await queryInterface.addIndex('Messages', ['conversationId', 'createdAt'], { name: 'idx_messages_conversation_created' });
    if (!names.has('idx_messages_conversation_unread')) await queryInterface.addIndex('Messages', ['conversationId', 'receiverId', 'isRead'], { name: 'idx_messages_conversation_unread' });
  },

  async down(queryInterface) {
    for (const name of ['idx_messages_conversation_unread', 'idx_messages_conversation_created', 'idx_messages_school_created']) {
      await queryInterface.removeIndex('Messages', name).catch(() => null);
    }
    const columns = await queryInterface.describeTable('Messages');
    if (columns.conversationId) await queryInterface.removeColumn('Messages', 'conversationId');
    if (columns.schoolCode) await queryInterface.removeColumn('Messages', 'schoolCode');
  }
};
