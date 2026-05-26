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
const FeeStructure = require('./FeeStructure')(sequelize, DataTypes);
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
const SubscriptionPlan = require('./SubscriptionPlan')(sequelize, DataTypes);
const SchoolCalendar = require('./SchoolCalendar')(sequelize, DataTypes);
const Timetable = require('./Timetable')(sequelize, DataTypes);
const ConductLog = require('./ConductLog')(sequelize, DataTypes);
const ResourceViews = require('./ResourceViews')(sequelize, DataTypes);
const MoodCheckin = require('./MoodCheckin')(sequelize, DataTypes);
const Department = require('./Department')(sequelize, DataTypes);
const DepartmentMember = require('./DepartmentMember')(sequelize, DataTypes);
const ChatGroup = require('./ChatGroup')(sequelize, DataTypes);
const ChatGroupMember = require('./ChatGroupMember')(sequelize, DataTypes);
const ChatMessage = require('./ChatMessage')(sequelize, DataTypes);
const ClassroomThread = require('./ClassroomThread')(sequelize, DataTypes);
const ThreadReply = require('./ThreadReply')(sequelize, DataTypes);
const AchievementEvent = require('./AchievementEvent')(sequelize, DataTypes);
const TutorSession = require('./TutorSession')(sequelize, DataTypes);
const TutorMessage = require('./TutorMessage')(sequelize, DataTypes);
const TutorProgress = require('./TutorProgress')(sequelize, DataTypes);
const TutorUsage = require('./TutorUsage')(sequelize, DataTypes);
const AuditLog = require('./AuditLog')(sequelize, DataTypes);
const ReportSnapshot = require('./ReportSnapshot')(sequelize, DataTypes);
const SchoolPaymentSetting = require('./SchoolPaymentSetting')(sequelize, DataTypes);
const PlatformPaymentSetting = require('./PlatformPaymentSetting')(sequelize, DataTypes);
const Subscription = require('./Subscription')(sequelize, DataTypes);
const SubscriptionPayment = require('./SubscriptionPayment')(sequelize, DataTypes);
const FeatureLock = require('./FeatureLock')(sequelize, DataTypes);

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
}, {
  tableName: 'StudentParents',
  timestamps: false,
  indexes: [{ unique: true, fields: ['studentId', 'parentId'] }]
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

// Fee Structure
FeeStructure.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
School.hasMany(FeeStructure, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });
FeeStructure.hasMany(Fee, { foreignKey: 'feeStructureId', sourceKey: 'id' });

// Fee
Fee.belongsTo(Student, { foreignKey: 'studentId' });
Student.hasMany(Fee, { foreignKey: 'studentId' });

// Payment
Payment.belongsTo(Fee, { foreignKey: 'feeId' });
Fee.hasMany(Payment, { foreignKey: 'feeId' });
Payment.belongsTo(FeeStructure, { foreignKey: 'feeStructureId', targetKey: 'id', constraints: false });
FeeStructure.hasMany(Payment, { foreignKey: 'feeStructureId', sourceKey: 'id', constraints: false });
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

Student.belongsTo(Class, { foreignKey: 'classId' });
Class.hasMany(Student, { foreignKey: 'classId' });

// HomeTask associations
HomeTask.belongsTo(Competency, { foreignKey: 'competencyId' });
HomeTask.belongsTo(LearningOutcome, { foreignKey: 'learningOutcomeId' });
HomeTask.belongsTo(Teacher, { foreignKey: 'createdBy' });
Teacher.hasMany(HomeTask, { foreignKey: 'createdBy' });
HomeTaskAssignment.belongsTo(Student, { foreignKey: 'studentId' });
HomeTaskAssignment.belongsTo(HomeTask, { foreignKey: 'taskId' });
Student.hasMany(HomeTaskAssignment, { foreignKey: 'studentId' });
HomeTask.hasMany(HomeTaskAssignment, { foreignKey: 'taskId' });


// V9 Chat, Department, Thread, Achievement associations
Department.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
School.hasMany(Department, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });
DepartmentMember.belongsTo(Department, { foreignKey: 'departmentId' });
Department.hasMany(DepartmentMember, { foreignKey: 'departmentId' });
DepartmentMember.belongsTo(Teacher, { foreignKey: 'teacherId' });
Teacher.hasMany(DepartmentMember, { foreignKey: 'teacherId' });

ChatGroup.belongsTo(School, { foreignKey: 'schoolCode', targetKey: 'schoolId' });
School.hasMany(ChatGroup, { foreignKey: 'schoolCode', sourceKey: 'schoolId' });
ChatGroup.belongsTo(Department, { foreignKey: 'departmentId' });
Department.hasMany(ChatGroup, { foreignKey: 'departmentId' });
ChatGroup.belongsTo(Class, { foreignKey: 'classId' });
Class.hasMany(ChatGroup, { foreignKey: 'classId' });
ChatGroupMember.belongsTo(ChatGroup, { foreignKey: 'groupId' });
ChatGroup.hasMany(ChatGroupMember, { foreignKey: 'groupId' });
ChatGroupMember.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(ChatGroupMember, { foreignKey: 'userId' });

ChatMessage.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
ChatMessage.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });
ChatMessage.belongsTo(ChatGroup, { foreignKey: 'groupId' });
User.hasMany(ChatMessage, { as: 'V9SentChatMessages', foreignKey: 'senderId' });
ChatGroup.hasMany(ChatMessage, { foreignKey: 'groupId' });

ClassroomThread.belongsTo(User, { as: 'Creator', foreignKey: 'createdBy' });
ClassroomThread.belongsTo(Teacher, { foreignKey: 'teacherId' });
ClassroomThread.belongsTo(Class, { foreignKey: 'classId' });
ClassroomThread.hasMany(ThreadReply, { foreignKey: 'threadId' });
ThreadReply.belongsTo(ClassroomThread, { foreignKey: 'threadId' });
ThreadReply.belongsTo(User, { as: 'Author', foreignKey: 'userId' });
ThreadReply.belongsTo(ThreadReply, { as: 'ParentReply', foreignKey: 'parentReplyId' });

AchievementEvent.belongsTo(User, { as: 'AwardedByUser', foreignKey: 'awardedBy' });
AchievementEvent.belongsTo(User, { as: 'RecipientUser', foreignKey: 'userId' });
AchievementEvent.belongsTo(Student, { foreignKey: 'studentId' });
Student.hasMany(AchievementEvent, { foreignKey: 'studentId' });

// Enhanced AI Tutor associations
Student.hasMany(TutorSession, { foreignKey: 'studentId' });
TutorSession.belongsTo(Student, { foreignKey: 'studentId' });
User.hasMany(TutorSession, { foreignKey: 'userId' });
TutorSession.belongsTo(User, { foreignKey: 'userId' });

TutorSession.hasMany(TutorMessage, { foreignKey: 'sessionId' });
TutorMessage.belongsTo(TutorSession, { foreignKey: 'sessionId' });
Student.hasMany(TutorMessage, { foreignKey: 'studentId' });
TutorMessage.belongsTo(Student, { foreignKey: 'studentId' });

Student.hasMany(TutorProgress, { foreignKey: 'studentId' });
TutorProgress.belongsTo(Student, { foreignKey: 'studentId' });
Student.hasMany(TutorUsage, { foreignKey: 'studentId' });
TutorUsage.belongsTo(Student, { foreignKey: 'studentId' });

Student.hasMany(ReportSnapshot, { foreignKey: 'studentId' });
ReportSnapshot.belongsTo(Student, { foreignKey: 'studentId' });

// Consent models associations
UserConsent.belongsTo(User, { foreignKey: 'userId' });
User.hasOne(UserConsent, { foreignKey: 'userId' });

ParentChildConsent.belongsTo(User, { as: 'ParentUser', foreignKey: 'parentId' });
ParentChildConsent.belongsTo(Student, { foreignKey: 'studentId' });

SchoolDPA.belongsTo(School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
SchoolDPA.belongsTo(User, { foreignKey: 'adminId' });


// Subscription & payment architecture
School.hasOne(SchoolPaymentSetting, { foreignKey: 'schoolId' });
SchoolPaymentSetting.belongsTo(School, { foreignKey: 'schoolId' });

School.hasMany(Subscription, { foreignKey: 'schoolId' });
Subscription.belongsTo(School, { foreignKey: 'schoolId' });
Parent.hasMany(Subscription, { foreignKey: 'parentId' });
Subscription.belongsTo(Parent, { foreignKey: 'parentId' });
Student.hasMany(Subscription, { foreignKey: 'studentId' });
Subscription.belongsTo(Student, { foreignKey: 'studentId' });
SubscriptionPlan.hasMany(Subscription, { foreignKey: 'planId' });
Subscription.belongsTo(SubscriptionPlan, { foreignKey: 'planId' });

Subscription.hasMany(SubscriptionPayment, { foreignKey: 'subscriptionId' });
SubscriptionPayment.belongsTo(Subscription, { foreignKey: 'subscriptionId' });
SubscriptionPlan.hasMany(SubscriptionPayment, { foreignKey: 'planId' });
SubscriptionPayment.belongsTo(SubscriptionPlan, { foreignKey: 'planId' });


// --- Global realtime sync hooks ---
// These hooks do not replace controller-specific business logic. They only notify dashboards
// that relevant DB-backed records changed so clients can refetch the affected sections.
function modelSchoolCode(instance) {
  const raw = instance?.toJSON ? instance.toJSON() : (instance || {});
  return raw.schoolCode || raw.schoolId || raw.school || raw.metadata?.schoolCode || raw.metadata?.schoolId || null;
}

function emitModelChange(modelName, action, instance) {
  try {
    if (!global.io) return;
    const code = modelSchoolCode(instance);
    if (!code) return;
    const typeMap = {
      Payment: 'payment:updated',
      Fee: 'fees:updated',
      FeeStructure: 'fees:updated',
      AcademicRecord: 'grades:updated',
      ReportSnapshot: 'reports:updated',
      Attendance: 'attendance:updated',
      HomeTask: 'homework:updated',
      HomeTaskAssignment: 'homework:updated',
      Alert: 'alerts:updated',
      ApprovalRequest: 'approvals:updated',
      Student: 'student:updated',
      Teacher: 'teacher:updated',
      Parent: 'parent:updated',
      Class: 'class:updated',
      Timetable: 'timetable:updated'
    };
    const type = typeMap[modelName] || `${modelName.toLowerCase()}:updated`;
    const payload = {
      type,
      model: modelName,
      action,
      id: instance?.id,
      schoolCode: String(code),
      schoolId: String(code),
      timestamp: new Date().toISOString()
    };
    global.io.to(`school-${code}`).emit('realtime:update', payload);
    global.io.to(`school-${code}`).emit(type, payload);
    if (['payment:updated','fees:updated','grades:updated','reports:updated','attendance:updated','homework:updated'].includes(type)) {
      global.io.to(`school-${code}`).emit('analytics:updated', { ...payload, type: 'analytics:updated', sourceType: type });
    }
  } catch (error) {
    console.error('[Realtime model hook failed]', modelName, action, error.message);
  }
}

function attachRealtimeHooks(model, modelName) {
  if (!model || model.__realtimeHooksAttached) return;
  model.__realtimeHooksAttached = true;
  model.addHook('afterCreate', (instance) => emitModelChange(modelName, 'created', instance));
  model.addHook('afterUpdate', (instance) => emitModelChange(modelName, 'updated', instance));
  model.addHook('afterDestroy', (instance) => emitModelChange(modelName, 'deleted', instance));
}

[
  [Payment, 'Payment'],
  [Fee, 'Fee'],
  [FeeStructure, 'FeeStructure'],
  [AcademicRecord, 'AcademicRecord'],
  [ReportSnapshot, 'ReportSnapshot'],
  [Attendance, 'Attendance'],
  [HomeTask, 'HomeTask'],
  [HomeTaskAssignment, 'HomeTaskAssignment'],
  [Alert, 'Alert'],
  [ApprovalRequest, 'ApprovalRequest'],
  [Student, 'Student'],
  [Teacher, 'Teacher'],
  [Parent, 'Parent'],
  [Class, 'Class'],
  [Timetable, 'Timetable']
].forEach(([model, name]) => attachRealtimeHooks(model, name));



// Production tenant guard: after a protected request is authenticated, all direct
// queries against models that carry schoolCode are automatically constrained to
// req.user.schoolCode unless the user is super_admin or the query explicitly sets
// skipTenantScope. This is a backstop; controllers should still pass tenant filters.
function installTenantHooks(models) {
  let getTenantContext = null;
  try { ({ getTenantContext } = require('../middleware/requestContext')); } catch (_) {}
  if (!getTenantContext) return;
  Object.values(models).forEach((model) => {
    if (!model || !model.rawAttributes || !model.rawAttributes.schoolCode || model.__tenantHookInstalled) return;
    model.__tenantHookInstalled = true;
    model.addHook('beforeFind', (options = {}) => {
      const ctx = getTenantContext() || {};
      const user = ctx.user;
      if (!user || user.role === 'super_admin' || options.skipTenantScope === true) return;
      if (!user.schoolCode) return;
      options.where = options.where || {};
      if (options.where.schoolCode && options.where.schoolCode !== user.schoolCode) {
        const err = new Error('Cross-school data access blocked');
        err.status = 403;
        throw err;
      }
      options.where.schoolCode = user.schoolCode;
    });
  });
}
installTenantHooks({ User, School, Student, Teacher, Parent, Admin, AcademicRecord, Attendance, Fee, FeeStructure, Payment, Message, Alert, ApprovalRequest, DutyRoster, UploadLog, Class, Settings, Task, HomeTask, Subscription, SubscriptionPayment, SchoolPaymentSetting, AuditLog });

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
    FeeStructure,
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
    StudentReward,
    SubscriptionPlan,
    ConductLog,
    ResourceViews,
    MoodCheckin,
    Timetable,
    Department,
    DepartmentMember,
    ChatGroup,
    ChatGroupMember,
    ChatMessage,
    ClassroomThread,
    ThreadReply,
    AchievementEvent,
    TutorSession,
    TutorMessage,
    TutorProgress,
    TutorUsage,
    AuditLog,
    ReportSnapshot,
    SchoolPaymentSetting,
    PlatformPaymentSetting,
    Subscription,
    SubscriptionPayment,
    FeatureLock,
    StudentParent
};
