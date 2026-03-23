module.exports = (sequelize, DataTypes) => {
    const Task = sequelize.define('Task', {
        teacherId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Teachers', key: 'id' }
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        dueDate: {
            type: DataTypes.DATEONLY
        },
        priority: {
            type: DataTypes.ENUM('low', 'medium', 'high'),
            defaultValue: 'medium'
        },
        completed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        completedAt: {
            type: DataTypes.DATE
        }
    }, {
        timestamps: true
    });
    
    return Task;
};
