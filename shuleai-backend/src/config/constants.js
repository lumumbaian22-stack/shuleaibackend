module.exports = {
  CURRICULUM_SYSTEMS: {
    '844': '8-4-4 System',
    'cbc': 'Competency Based Curriculum',
    'british': 'British Curriculum',
    'american': 'American Curriculum'
  },
  TERMS: ['Term 1', 'Term 2', 'Term 3'],
  ASSESSMENT_TYPES: ['test', 'exam', 'assignment', 'project', 'quiz'],
  ATTENDANCE_STATUS: ['present', 'absent', 'late', 'holiday', 'sick'],
  ALERT_TYPES: ['academic', 'attendance', 'fee', 'system', 'improvement', 'duty', 'approval'],
  ALERT_SEVERITY: ['critical', 'warning', 'info', 'success'],
  PAYMENT_METHODS: ['mpesa', 'bank', 'cash', 'card'],
  PAYMENT_PLANS: {
    basic: { name: 'Basic Access', price: 5000 },
    premium: { name: 'Premium Access', price: 10000 },
    ultimate: { name: 'Ultimate Access', price: 15000 }
  },
  DUTY_TYPES: ['morning', 'lunch', 'afternoon', 'whole_day'],
  DUTY_AREAS: {
    morning: 'School Gate / Assembly Area',
    lunch: 'Dining Hall / Playground',
    afternoon: 'School Compound / Classrooms',
    whole_day: 'General Supervision'
  },
  DUTY_TIME_SLOTS: {
    morning: { start: '07:30', end: '08:30' },
    lunch: { start: '12:30', end: '14:00' },
    afternoon: { start: '15:30', end: '16:30' },
    whole_day: { start: '07:30', end: '16:30' }
  },
  APPROVAL_STATUS: ['pending', 'approved', 'rejected', 'suspended'],
  UPLOAD_TYPES: ['students', 'marks', 'attendance'],
  SCHOOL_ID_FORMATS: {
    standard: 'SCH-YYYY-XXXXX',
    simple: 'SCHOOLXXX',
    custom: 'PREFIX-XXXXX'
  }
};