# Shule AI V3 Backend Functional Fix Report

This package is a stabilization/functionality pass based on your requested rules.

## Implemented
- Class teacher assignment is authoritative through `Class.teacherId` and `Teacher.classId/classTeacher`.
- Subject teacher assignment is kept in `Class.subjectTeachers` and mirrored to `TeacherSubjectAssignment` where possible.
- Class teacher can upload CSV students only for their assigned class.
- Subject teacher can draft marks only for assigned class/subject.
- Class teacher publishes final marks for the class report card.
- Student model now supports: `assessmentNumber`, `nemisNumber`, `location`, `parentName`, `parentEmail`, `parentPhone`, `parentRelationship`, `isPrefect`.
- Fixed broken prefect badge data field placement.
- Timetable generator now generates for all school classes, stores per-class timetables, avoids teacher/class double-booking, includes breaks/lunch, warnings, term/year/scope.
- Calendar model supports term/year/description.
- Profile upload supports both multer `req.file` and express-fileupload `req.files`.
- Gamification `Class` import bug fixed.

## Must run
```bash
npm install
npm run migrate
npm start
```

## Important
This is not a full rewrite; it is a functional patch that keeps your current backend structure but fixes the biggest logic mismatches.
