module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: true, // null for group messages
      references: { model: 'Users', key: 'id' }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    replyToMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Messages', key: 'id' }
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readAt: DataTypes.DATE,
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    timestamps: true
  });

  return Message;
};
