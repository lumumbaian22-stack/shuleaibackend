module.exports = (sequelize, DataTypes) => {
  const ThreadReply = sequelize.define('ThreadReply', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    threadId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    parentReplyId: { type: DataTypes.INTEGER, allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    pointsAwarded: { type: DataTypes.INTEGER, defaultValue: 0 },
    streakAwarded: { type: DataTypes.INTEGER, defaultValue: 0 },
    helpfulCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return ThreadReply;
};
