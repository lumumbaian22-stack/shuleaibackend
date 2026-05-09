'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Users');
    if (!table.profilePicture) {
      await queryInterface.addColumn('Users', 'profilePicture', { type: Sequelize.STRING, allowNull: true });
    }
    if (!table.profileImage) {
      await queryInterface.addColumn('Users', 'profileImage', { type: Sequelize.STRING, allowNull: true });
    }
    await queryInterface.sequelize.query('UPDATE "Users" SET "profilePicture" = "profileImage" WHERE "profilePicture" IS NULL AND "profileImage" IS NOT NULL');
    await queryInterface.sequelize.query('UPDATE "Users" SET "profileImage" = "profilePicture" WHERE "profileImage" IS NULL AND "profilePicture" IS NOT NULL');
  },

  async down(queryInterface) {
    // Keep profilePicture on rollback to avoid breaking older frontend deployments that still request it.
  }
};
