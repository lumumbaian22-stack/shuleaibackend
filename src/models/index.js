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

// --- Associations ---

// User to role-specific profiles
User.hasOne(Student, { foreignKey: 'userId', onDelete: 'CASCADE' });
Student.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Teacher, { foreignKey: 'userId', onDelete: 'CASCADE' });
Teacher.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Parent, { foreignKey: 'userId', onDelete: 'CASCADE' });
Parent.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Admin, { foreignKey: 'userId', onDelete: 'CASCADE' });
Admin.belongsTo(User, { foreignKey: 'userId' });

// School <-> User (using schoolId as the key)
School.hasMany(User, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });
User.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });


// Student-Parent many-to-many relationship
const StudentParent = sequelize.define('StudentParent', {
  studentId: { 
    type: DataTypes.INTEGER, 
    references: { model: 'Students', key: 'id' },
    onDelete: 'CASCADE'
  },
  parentId: { 
    type: DataTypes.INTEGER, 
    references: { model: 'Parents', key: 'id' },
    onDelete: 'CASCADE'
  }
});

// Define the relationships with proper aliases
Student.belongsToMany(Parent, { 
  through: StudentParent, 
  foreignKey: 'studentId',
  as: 'parents'  // This creates student.getParents(), student.addParent(), etc.
});

Parent.belongsToMany(Student, { 
  through: StudentParent, 
  foreignKey: 'parentId',
  as: 'students'  // This creates parent.getStudents(), parent.addStudent(), etc.
});

// Also add these direct relationships if you need them
Student.hasMany(StudentParent, { foreignKey: 'studentId' });
StudentParent.belongsTo(Student, { foreignKey: 'studentId' });

Parent.hasMany(StudentParent, { foreignKey: 'parentId' });
StudentParent.belongsTo(Parent, { foreignKey: 'parentId' });

// AcademicRecord
AcademicRecord.belongsTo(Student, { foreignKey: 'studentId' });
AcademicRecord.belongsTo(Teacher, { foreignKey: 'teacherId' });

// Attendance
Attendance.belongsTo(Student, { foreignKey: 'studentId' });

// Fee
Fee.belongsTo(Student, { foreignKey: 'studentId' });

// Payment
Payment.belongsTo(Student, { foreignKey: 'studentId' });
Payment.belongsTo(Parent, { foreignKey: 'parentId' });

// Message
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });

// Alert
Alert.belongsTo(User, { foreignKey: 'userId' });

// ApprovalRequest
ApprovalRequest.belongsTo(User, { foreignKey: 'userId' });
ApprovalRequest.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });

// DutyRoster
DutyRoster.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });

// UploadLog
UploadLog.belongsTo(User, { foreignKey: 'uploadedBy' });

// SchoolNameRequest
SchoolNameRequest.belongsTo(User, { foreignKey: 'requestedBy' });
// If your School model does not have a 'code' field, use 'schoolId' as targetKey.
// Here we assume School has a 'schoolId' field.
SchoolNameRequest.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });

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
