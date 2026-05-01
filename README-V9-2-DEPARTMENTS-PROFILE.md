# Shule AI Backend V9.2

## Added

### Department update/delete APIs
- `PUT /api/chat-v9/departments/:departmentId`
- `DELETE /api/chat-v9/departments/:departmentId`

### Department heads
Department head is stored in `Departments.headTeacherId`.
The head is saved as `DepartmentMember.role = 'head'`.
The head is added to the department group chat as group admin.

### Department group chat
Department groups appear in teacher group list because they are stored as `ChatGroups` type `department`.

## Deploy
Run migrations if V9 tables are not already created:

```bash
npm run migrate
```
