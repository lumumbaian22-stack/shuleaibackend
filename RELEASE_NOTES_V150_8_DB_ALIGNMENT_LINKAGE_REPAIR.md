# Shule AI v150.8 — DB Alignment + Linkage Resolver Repair

This build fixes database contract mismatches found in v150.7 without touching the stable v149.8 timetable DB save/publish logic.

## Fixed
- Removed remaining report-history lookups that queried non-existent `Student.schoolCode`; student school scope now resolves through `Student -> User.schoolCode`.
- Fixed shared `schoolLinkageService.resolveClassStudents()` so class filters and active-status filters no longer overwrite each other.
- Aligned `StudentParent` Sequelize model with the `StudentParents` table: `relationship`, `linkedByElimuId`, `linkedAt`, `status`, `source`, verification, metadata, and timestamps.
- Teacher class parent messages, birthdays, transfer options, class students, and timetable class resolution now share the same resolver pattern.
- Added active `StudentEnrollment` fallback for class-student and student-class resolution.
- Removed `Class.classTeacherId` assumptions from report access checks.
- Added DB migration for `StudentParents` alignment and `AcademicRecords` dynamic assessment fields.
- Added `assessmentKey`, `assessmentCategory`, `maxScore`, weight/show/count/order fields to AcademicRecord model and teacher marks save flows.
- Backend now keeps exact assessment identity for openers/custom tests/CAT/Midterm/End Term calculations.

## Untouched
- Timetable DB connection fix from v149.8.
- Timetable save/publish core write path.
- Auth core.
- Finance core.
- Dashboard routing.
