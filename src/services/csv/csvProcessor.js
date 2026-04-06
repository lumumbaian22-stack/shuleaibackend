const fs = require('fs');
const csv = require('csv-parser');
const { Student, User, Parent, AcademicRecord, Attendance, Teacher } = require('../../models');

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

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          for (const row of results) {
            try {
              const name = row.name?.trim();
              const grade = row.grade?.trim();
              const parentEmail = row.parentEmail?.trim() || row.parentemail?.trim();
              const parentPhone = row.parentPhone?.trim() || row.parentphone?.trim();
              const dob = row.dateOfBirth || row.dob;
              const gender = row.gender?.toLowerCase();

              if (!name || !grade) {
                errors.push({ row, error: 'Missing name or grade' });
                failed++;
                continue;
              }

              let user = await User.findOne({ where: { email: parentEmail, role: 'student' } });
              let student;
              if (user) {
                student = await Student.findOne({ where: { userId: user.id } });
                if (student) {
                  warnings.push({ row, message: `Student already exists: ${name}` });
                  updated++;
                  continue;
                }
              }

              user = await User.create({
                name,
                email: null,
                password: 'Student123!',
                role: 'student',
                phone: null,
                schoolCode: this.schoolCode,
                isActive: true,
                firstLogin: true
              });

              student = await Student.create({
                userId: user.id,
                grade,
                dateOfBirth: dob ? new Date(dob) : null,
                gender: gender === 'male' ? 'male' : gender === 'female' ? 'female' : null,
                status: 'active'
              });
              created++;

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
