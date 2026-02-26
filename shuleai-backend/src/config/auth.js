module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '30d'
  },
  password: {
    minLength: 6
  },
  roles: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    TEACHER: 'teacher',
    PARENT: 'parent',
    STUDENT: 'student'
  },
  permissions: {
    SUPER_ADMIN: ['*'],
    ADMIN: [
      'manage_teachers',
      'manage_classes',
      'view_all_students',
      'view_financial',
      'manage_school',
      'manage_duty',
      'approve_teachers'
    ],
    TEACHER: [
      'manage_marks',
      'manage_attendance',
      'add_comments',
      'view_class_students',
      'upload_students',
      'view_own_duty',
      'check_in_duty'
    ],
    PARENT: [
      'view_child_academics',
      'view_child_attendance',
      'view_fees',
      'make_payment',
      'report_absence',
      'view_duty_schedule'
    ],
    STUDENT: [
      'view_own_grades',
      'view_own_attendance',
      'access_materials',
      'chat_ai',
      'chat_peers',
      'view_duty_schedule'
    ]
  }
};