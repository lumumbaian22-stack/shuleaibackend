const fs = require('fs');
const csv = require('csv-parser');
const { Student, User, Parent, Class, Teacher, AcademicRecord, Attendance } = require('../../models');
class CSVProcessor {
  constructor(schoolCode, userId) {
    this.schoolCode = schoolCode;
    this.userId = userId;
  }

  async processStudentUpload(filePath) {
    const results = [];
    const errors = [];
    const warnings = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    // Verify teacher and get assigned class
    const teacher = await Teacher.findOne({ where: { userId: this.userId }, include: [{ model: Class, as: 'Class' }] });
    if (!teacher || !teacher.classId) {
      throw new Error('Only class teachers can upload students, and you must be assigned to a class.');
    }
    const targetClass = teacher.Class;
    if (!targetClass) throw new Error('Assigned class not found.');

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          for (const row of results) {
            try {
              const name = row.name?.trim();
              const dob = row.dateOfBirth || row.dob;
              const parentEmail = row.parentEmail?.trim() || row.parentemail?.trim();
              const parentPhone = row.parentPhone?.trim() || row.parentphone?.trim();
              const gender = row.gender?.toLowerCase();

              if (!name) {
                errors.push({ row, error: 'Missing name' });
                failed++;
                continue;
              }

              // Check duplicate: name + DOB + parentEmail
              let existingStudent = null;
              if (dob && parentEmail) {
                existingStudent = await Student.findOne({
                  include: [{
                    model: User,
                    where: {
                      name,
                      email: parentEmail,
                      schoolCode: this.schoolCode
                    }
                  }]
                });
              }
              if (existingStudent) {
                errors.push({ row, error: `Duplicate student: ${name} with same DOB and parent email already exists.` });
                failed++;
                continue;
              }

              // Create user
              const user = await User.create({
                name,
                email: null,
                password: 'Student123!',
                role: 'student',
                phone: null,
                schoolCode: this.schoolCode,
                isActive: true,
                firstLogin: true
              });

              // Create student – force teacher's class
              const student = await Student.create({
                userId: user.id,
                grade: targetClass.name,
                dateOfBirth: dob ? new Date(dob) : null,
                gender: gender === 'male' ? 'male' : gender === 'female' ? 'female' : null,
                status: 'active'
              });
              created++;

              // Link parent
              if (parentEmail) {
                let parentUser = await User.findOne({ where: { email: parentEmail, role: 'parent' } });
                let parent;
                if (!parentUser) {
                  parentUser = await User.create({
                    name: `Parent of ${name}`,
                    email: parentEmail,
                    password: 'Parent123!',
                    role: 'parent',
                    phone: parentPhone,
                    schoolCode: this.schoolCode,
                    isActive: true
                  });
                  parent = await Parent.create({
                    userId: parentUser.id,
                    relationship: 'guardian'
                  });
                } else {
                  parent = await Parent.findOne({ where: { userId: parentUser.id } });
                }
                if (parent) {
                  await parent.addStudent(student);
                }
              }
            } catch (err) {
              errors.push({ row, error: err.message });
              failed++;
            }
          }
          resolve({
            stats: { processed: results.length, created, updated, failed },
            errors,
            warnings
          });
        })
        .on('error', reject);
    });
  }

  async processMarksUpload(filePath) {
    const results = [];
    const errors = [];
    let created = 0;
    let failed = 0;

    const teacher = await Teacher.findOne({ where: { userId: this.userId } });
    if (!teacher) throw new Error('Teacher not found');

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          for (const row of results) {
            try {
              const elimuid = row.elimuid?.trim();
              const subject = row.subject?.trim();
              const score = parseInt(row.score);
              const assessmentType = row.assessmentType?.trim() || 'test';
              const date = row.date ? new Date(row.date) : new Date();
              const assessmentName = row.assessmentName?.trim() || `${subject} ${assessmentType}`;

              if (!elimuid || !subject || isNaN(score)) {
                errors.push({ row, error: 'Missing elimuid, subject, or score' });
                failed++;
                continue;
              }

              const student = await Student.findOne({
                where: { elimuid },
                include: [{ model: User, where: { schoolCode: this.schoolCode } }]
              });
              if (!student) {
                errors.push({ row, error: 'Student not found' });
                failed++;
                continue;
              }

              await AcademicRecord.create({
                studentId: student.id,
                schoolCode: this.schoolCode,
                term: row.term || 'Term 1',
                year: row.year || new Date().getFullYear(),
                subject,
                assessmentType,
                assessmentName,
                score,
                teacherId: teacher.id,
                date,
                isPublished: true
              });
              created++;
            } catch (err) {
              errors.push({ row, error: err.message });
              failed++;
            }
          }
          resolve({
            stats: { processed: results.length, created, failed },
            errors
          });
        })
        .on('error', reject);
    });
  }

  async processAttendanceUpload(filePath) {
    const results = [];
    const errors = [];
    let created = 0;
    let failed = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          for (const row of results) {
            try {
              const elimuid = row.elimuid?.trim();
              const date = row.date ? new Date(row.date) : new Date();
              const status = row.status?.toLowerCase();
              const reason = row.reason?.trim();

              if (!elimuid || !status) {
                errors.push({ row, error: 'Missing elimuid or status' });
                failed++;
                continue;
              }

              const student = await Student.findOne({
                where: { elimuid },
                include: [{ model: User, where: { schoolCode: this.schoolCode } }]
              });
              if (!student) {
                errors.push({ row, error: 'Student not found' });
                failed++;
                continue;
              }

              const [attendance] = await Attendance.findOrCreate({
                where: { studentId: student.id, date },
                defaults: {
                  studentId: student.id,
                  schoolCode: this.schoolCode,
                  date,
                  status,
                  reason,
                  reportedBy: this.userId
                }
              });
              if (!attendance.isNewRecord) {
                await attendance.update({ status, reason });
              }
              created++;
            } catch (err) {
              errors.push({ row, error: err.message });
              failed++;
            }
          }
          resolve({
            stats: { processed: results.length, created, failed },
            errors
          });
        })
        .on('error', reject);
    });
  }
}

module.exports = CSVProcessor;
