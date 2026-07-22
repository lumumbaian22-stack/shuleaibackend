'use strict';

const { reconcileModels } = require('./lib/canonical-model-reconciler');

module.exports = {
  async up(queryInterface, Sequelize) {
    const Message = queryInterface.sequelize.models.Message;
    await reconcileModels(queryInterface, Sequelize, [Message]);

    await queryInterface.sequelize.query(`
      UPDATE "Messages"
         SET "schoolCode" = COALESCE("schoolCode", NULLIF("metadata"->>'schoolCode', '')),
             "conversationId" = COALESCE("conversationId", NULLIF(COALESCE("metadata"->>'conversationKey', "metadata"->>'conversationId'), ''))
       WHERE "metadata" IS NOT NULL
         AND ("schoolCode" IS NULL OR "conversationId" IS NULL)
    `);

    await queryInterface.addIndex('Messages', ['schoolCode', 'createdAt'], { name: 'idx_messages_school_created' });
    await queryInterface.addIndex('Messages', ['conversationId', 'createdAt'], { name: 'idx_messages_conversation_created' });
    await queryInterface.addIndex('Messages', ['conversationId', 'receiverId', 'isRead'], { name: 'idx_messages_conversation_unread' });
  },
  async down() {}
};
