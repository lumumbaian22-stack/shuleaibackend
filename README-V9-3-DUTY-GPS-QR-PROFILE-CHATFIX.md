# Shule AI Backend V9.3

## Added

### Smart Duty Verification API
- `GET /api/duty/verification-config`
- `PUT /api/duty/verification-config`
- `POST /api/duty/check-in/verified`
- `POST /api/duty/check-out/verified`
- `GET /api/duty/compliance-report`
- `GET /api/duty/late-arrivals`

Verification includes:
- GPS latitude/longitude
- Distance from school geofence
- Server timestamp
- QR token validation
- Late status / late minutes
- Device info

### Admin Department Group Chat Fix
- `GET /api/chat-v9/departments/:departmentId/group`

Admin can now open exact department group chat.

### Teacher Department Group Metadata
Teacher group list now includes:
- department name
- department head name
- department head user id

## Deploy

Run migrations if needed:

```bash
npm run migrate
```

No new table is required for V9.3 duty verification because it stores verification records inside existing DutyRoster JSONB duties.
