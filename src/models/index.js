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
const Class = require('./Class')(sequelize, DataTypes);
const Settings = require('./Settings')(sequelize, DataTypes);
const TeacherSubjectAssignment = require('./TeacherSubjectAssignment')(sequelize, DataTypes);
const Task = require('./Task')(sequelize, DataTypes);

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

// School <-> User associations - FIXED with proper aliases
// Base association for all users
School.hasMany(User, { 
    foreignKey: 'schoolCode', 
    sourceKey: 'schoolId',
    as: 'users'  // This creates the 'users' alias for all users in a school
});

// Specific association for admins only - THIS IS WHAT YOUR CONTROLLER NEEDS
School.hasMany(User, { 
    foreignKey: 'schoolCode', 
    sourceKey: 'schoolId',
    as: 'admins',  // This must match what you use in superAdminController
    scope: { role: 'admin' } // This automatically filters for users with role 'admin'
});

// Specific association for teachers only
School.hasMany(User, { 
    foreignKey: 'schoolCode', 
    sourceKey: 'schoolId',
    as: 'teachers',
    scope: { role: 'teacher' }
});

// Specific association for parents only
School.hasMany(User, { 
    foreignKey: 'schoolCode', 
    sourceKey: 'schoolId',
    as: 'parents',
    scope: { role: 'parent' }
});

// Specific association for students only
School.hasMany(User, { 
    foreignKey: 'schoolCode', 
    sourceKey: 'schoolId',
    as: 'students',
    scope: { role: 'student' }
});

User.belongsTo(School, { 
    foreignKey: 'schoolCode', 
    targetKey: 'schoolId' 
});

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
Student.hasMany(AcademicRecord, { foreignKey: 'studentId' });
Teacher.hasMany(AcademicRecord, { foreignKey: 'teacherId' });

// Attendance
Attendance.belongsTo(Student, { foreignKey: 'studentId' });
Student.hasMany(Attendance, { foreignKey: 'studentId' });

// Fee
Fee.belongsTo(Student, { foreignKey: 'studentId' });
Student.hasMany(Fee, { foreignKey: 'studentId' });

// Payment
Payment.belongsTo(Student, { foreignKey: 'studentId' });
Payment.belongsTo(Parent, { foreignKey: 'parentId' });
Student.hasMany(Payment, { foreignKey: 'studentId' });
Parent.hasMany(Payment, { foreignKey: 'parentId' });

// Message
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });
User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'receiverId' });

// Alert
Alert.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Alert, { foreignKey: 'userId' });

// ApprovalRequest
ApprovalRequest.belongsTo(User, { foreignKey: 'userId' });
ApprovalRequest.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
User.hasMany(ApprovalRequest, { foreignKey: 'userId' });
School.hasMany(ApprovalRequest, { foreignKey: 'schoolId', sourceKey: 'schoolId' });

// DutyRoster
DutyRoster.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
School.hasMany(DutyRoster, { foreignKey: 'schoolId', sourceKey: 'schoolId' });

// UploadLog
UploadLog.belongsTo(User, { foreignKey: 'uploadedBy' });
User.hasMany(UploadLog, { foreignKey: 'uploadedBy' });

// SchoolNameRequest
SchoolNameRequest.belongsTo(User, { foreignKey: 'requestedBy' });
SchoolNameRequest.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
User.hasMany(SchoolNameRequest, { foreignKey: 'requestedBy' });
School.hasMany(SchoolNameRequest, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });

// Add associations
TeacherSubjectAssignment.belongsTo(Teacher, { foreignKey: 'teacherId' });
TeacherSubjectAssignment.belongsTo(Class, { foreignKey: 'classId' });
Teacher.hasMany(TeacherSubjectAssignment, { foreignKey: 'teacherId' });
Class.hasMany(TeacherSubjectAssignment, { foreignKey: 'classId' });

// Add association
Task.belongsTo(Teacher, { foreignKey: 'teacherId' });
Teacher.hasMany(Task, { foreignKey: 'teacherId' });

// Add associations
Class.belongsTo(Teacher, { foreignKey: 'teacherId' });
Teacher.hasMany(Class, { foreignKey: 'teacherId' });

Class.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
School.hasMany(Class, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });

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
    SchoolNameRequest,
    Class,
    Settings,
    TeacherSubjectAssignment,
    Task
};
