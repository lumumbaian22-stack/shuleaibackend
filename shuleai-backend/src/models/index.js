const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Import all models
const User = require('./User')(sequelize, DataTypes);
const School = require('./School')(sequelize, DataTypes);
const Student = require('./Student')(sequelize, DataTypes);
const Teacher = require('./Teacher')(sequelize, DataTypes);
const Parent = require('./Parent')(sequelize, DataTypes);
const Admin = require('./Admin')(sequelize, DataTypes);
const AcademicRecord = require('./AcademicRecord')(sequelize, DataTypes);
const Attendance = require('./Attendance')(sequelize, DataTypes);
const Fee = require('./Fee')(sequelize, DataTypes);
const Payment = require('./Payment')(sequelize, DataTypes);
const Message = require('./Message')(sequelize, DataTypes);
const Alert = require('./Alert')(sequelize, DataTypes);
const ApprovalRequest = require('./ApprovalRequest')(sequelize, DataTypes);
const DutyRoster = require('./DutyRoster')(sequelize, DataTypes);
const UploadLog = require('./UploadLog')(sequelize, DataTypes);
const SchoolNameRequest = require('./SchoolNameRequest')(sequelize, DataTypes);

// Associations
User.hasOne(Student, { foreignKey: 'userId', onDelete: 'CASCADE' });
Student.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Teacher, { foreignKey: 'userId', onDelete: 'CASCADE' });
Teacher.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Parent, { foreignKey: 'userId', onDelete: 'CASCADE' });
Parent.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Admin, { foreignKey: 'userId', onDelete: 'CASCADE' });
Admin.belongsTo(User, { foreignKey: 'userId' });

// School <-> User: using schoolId as the key
School.hasMany(User, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });
User.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });

const StudentParent = sequelize.define('StudentParent', {
  studentId: { type: DataTypes.INTEGER, references: { model: Student, key: 'id' } },
  parentId: { type: DataTypes.INTEGER, references: { model: Parent, key: 'id' } }
});
Student.belongsToMany(Parent, { through: StudentParent, foreignKey: 'studentId' });
Parent.belongsToMany(Student, { through: StudentParent, foreignKey: 'parentId' });

AcademicRecord.belongsTo(Student, { foreignKey: 'studentId' });
AcademicRecord.belongsTo(Teacher, { foreignKey: 'teacherId' });

Attendance.belongsTo(Student, { foreignKey: 'studentId' });

Fee.belongsTo(Student, { foreignKey: 'studentId' });

Payment.belongsTo(Student, { foreignKey: 'studentId' });
Payment.belongsTo(Parent, { foreignKey: 'parentId' });

Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });

Alert.belongsTo(User, { foreignKey: 'userId' });

ApprovalRequest.belongsTo(User, { foreignKey: 'userId' });
ApprovalRequest.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });

DutyRoster.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });

UploadLog.belongsTo(User, { foreignKey: 'uploadedBy' });

SchoolNameRequest.belongsTo(User, { foreignKey: 'requestedBy' });
SchoolNameRequest.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'code' }); // Note: School has `code` field? If not, adjust.

module.exports = {
  sequelize,
  User,
  School,
  Student,
  Teacher,
  Parent,
  Admin,
  AcademicRecord,
  Attendance,
  Fee,
  Payment,
  Message,
  Alert,
  ApprovalRequest,
  DutyRoster,
  UploadLog,
  SchoolNameRequest
};