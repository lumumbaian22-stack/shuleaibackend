# Shule AI Backend V9.4

## Added / Updated

### School registration school type
`adminSignup` now accepts:

```json
{
  "schoolType": "day | boarding | day_boarding"
}
```

Stored inside `School.settings.schoolType` and `School.settings.boarding`.

### Teacher edit support
`PUT /api/admin/teachers/:teacherId` now accepts additional editable profile fields including:
- employeeId
- department
- approvalStatus
- qualification
- subjects
- classId
- tscNumber
- location
- notes
- roles

Extra profile fields are stored inside Teacher.duties.profile to avoid requiring a new migration.

### Student edit support
`PUT /api/admin/students/:studentId` now accepts:
- assessmentNumber
- nemisNumber
- location
- parentName
- parentEmail
- parentPhone
- parentRelationship
- dateOfBirth
- gender
- academicStatus
- house
- transport
- stream
- medicalNotes
- disciplineNotes
- clubs
- schoolType
- isPrefect

Extra flexible fields are stored inside Student.preferences.

### Alerts
`POST /api/alerts` now supports:
- bulk audience by roles
- severity labels low/medium/high/critical
- role-aware recipients
- deliveryMethods metadata

Database enum compatibility:
- low -> info
- medium/high -> warning
- critical -> critical
- original severity label is saved in `data.severityLevel`.

## Also preserved
- V9.3 Duty GPS/QR backend
- V9.3 department group chat endpoint
- V9.2 departments
- Existing migrations

## Deploy
Run:

```bash
npm run migrate
```

No new table is required for V9.4.
