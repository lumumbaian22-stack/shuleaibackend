const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const UserConsent = require('./UserConsent')(sequelize, DataTypes);
const ParentChildConsent = require('./ParentChildConsent')(sequelize, DataTypes);
const SchoolDPA = require('./SchoolDPA')(sequelize, DataTypes);

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
const TeacherSubjectAssignment = require('./TeacherSubjectAssignment')(sequelize);
const Task = require('./Task')(sequelize, DataTypes);
const Competency = require('./Competency')(sequelize, DataTypes);
const LearningOutcome = require('./LearningOutcome')(sequelize, DataTypes);
const StudentCompetencyProgress = require('./StudentCompetencyProgress')(sequelize, DataTypes);
const HomeTaskAssignment = require('./HomeTaskAssignment')(sequelize, DataTypes);
const HomeTask = require('./HomeTask')(sequelize, DataTypes);
const Badge = require('./Badge')(sequelize, DataTypes);
const StudentBadge = require('./StudentBadge')(sequelize, DataTypes);
const Reward = require('./Reward')(sequelize, DataTypes);
const StudentReward = require('./StudentReward')(sequelize, DataTypes);
const SchoolCalendar = require('./SchoolCalendar')(sequelize, DataTypes);
// Add to associations: School.hasMany(SchoolCalendar)

// --- Associations ---
Competency.hasMany(LearningOutcome, { foreignKey: 'competencyId' });
LearningOutcome.belongsTo(Competency, { foreignKey: 'competencyId' });

LearningOutcome.hasMany(StudentCompetencyProgress, { foreignKey: 'learningOutcomeId' });
StudentCompetencyProgress.belongsTo(LearningOutcome, { foreignKey: 'learningOutcomeId' });

Student.hasMany(StudentCompetencyProgress, { foreignKey: 'studentId' });
StudentCompetencyProgress.belongsTo(Student, { foreignKey: 'studentId' });

// User to role-specific profiles
User.hasOne(Student, { foreignKey: 'userId', onDelete: 'CASCADE' });
Student.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Teacher, { foreignKey: 'userId', onDelete: 'CASCADE' });
Teacher.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Parent, { foreignKey: 'userId', onDelete: 'CASCADE' });
Parent.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Admin, { foreignKey: 'userId', onDelete: 'CASCADE' });
Admin.belongsTo(User, { foreignKey: 'userId' });

// School <-> User associations
School.hasMany(User, {
    foreignKey: 'schoolCode',
    sourceKey: 'schoolId',
    as: 'users'
});

School.hasMany(User, {
    foreignKey: 'schoolCode',
    sourceKey: 'schoolId',
    as: 'admins',
    scope: { role: 'admin' }
});

School.hasMany(User, {
    foreignKey: 'schoolCode',
    sourceKey: 'schoolId',
    as: 'teachers',
    scope: { role: 'teacher' }
});

School.hasMany(User, {
    foreignKey: 'schoolCode',
    sourceKey: 'schoolId',
    as: 'parents',
    scope: { role: 'parent' }
});

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

// Student-Parent many-to-many
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

Student.belongsToMany(Parent, {
  through: StudentParent,
  foreignKey: 'studentId',
  as: 'parents'
});

Parent.belongsToMany(Student, {
  through: StudentParent,
  foreignKey: 'parentId',
  as: 'students'
});

Student.hasMany(StudentParent, { foreignKey: 'studentId' });
StudentParent.belongsTo(Student, { foreignKey: 'studentId' });

Parent.hasMany(StudentParent, { foreignKey: 'parentId' });
StudentParent.belongsTo(Parent, { foreignKey: 'parentId' });

// Associations
Badge.hasMany(StudentBadge, { foreignKey: 'badgeId' });
StudentBadge.belongsTo(Badge, { foreignKey: 'badgeId' });
Student.hasMany(StudentBadge, { foreignKey: 'studentId' });
StudentBadge.belongsTo(Student, { foreignKey: 'studentId' });

Reward.hasMany(StudentReward, { foreignKey: 'rewardId' });
StudentReward.belongsTo(Reward, { foreignKey: 'rewardId' });
Student.hasMany(StudentReward, { foreignKey: 'studentId' });
StudentReward.belongsTo(Student, { foreignKey: 'studentId' });


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

// TeacherSubjectAssignment
TeacherSubjectAssignment.belongsTo(Teacher, { foreignKey: 'teacherId' });
TeacherSubjectAssignment.belongsTo(Class, { foreignKey: 'classId' });
Teacher.hasMany(TeacherSubjectAssignment, { foreignKey: 'teacherId' });
Class.hasMany(TeacherSubjectAssignment, { foreignKey: 'classId' });

// Task - CORRECTED: belongs to User, not Teacher
Task.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Task, { foreignKey: 'userId' });

// Class-Teacher
Teacher.belongsTo(Class, { foreignKey: 'classId' });
Class.hasOne(Teacher, { foreignKey: 'classId' });

Class.belongsTo(Teacher, { foreignKey: 'teacherId' });
Teacher.hasMany(Class, { foreignKey: 'teacherId' });

Class.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
School.hasMany(Class, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });

// HomeTask associations
HomeTask.belongsTo(Competency, { foreignKey: 'competencyId' });
HomeTask.belongsTo(LearningOutcome, { foreignKey: 'learningOutcomeId' });
HomeTaskAssignment.belongsTo(Student, { foreignKey: 'studentId' });
HomeTaskAssignment.belongsTo(HomeTask, { foreignKey: 'taskId' });
Student.hasMany(HomeTaskAssignment, { foreignKey: 'studentId' });
HomeTask.hasMany(HomeTaskAssignment, { foreignKey: 'taskId' });

// Consent models associations
UserConsent.belongsTo(User, { foreignKey: 'userId' });
User.hasOne(UserConsent, { foreignKey: 'userId' });

ParentChildConsent.belongsTo(User, { as: 'ParentUser', foreignKey: 'parentId' });
ParentChildConsent.belongsTo(Student, { foreignKey: 'studentId' });

SchoolDPA.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
SchoolDPA.belongsTo(User, { foreignKey: 'adminId' });

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
    Task,
    HomeTask,
    Competency,
    LearningOutcome,
    HomeTaskAssignment,
    SchoolDPA,
    ParentChildConsent,
    UserConsent,
    StudentCompetencyProgress,
    SchoolCalendar,
    Badge,
    StudentBadge,
    Reward,
    StudentReward
    
};
