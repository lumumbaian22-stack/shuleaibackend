# Backup and Restore Runbook

## Before live schools
1. Confirm Render Postgres backup retention.
2. Export a manual backup before first school onboarding.
3. Restore that backup into a temporary database.
4. Point a staging backend to the restored database.
5. Verify login, students, fees, reports and uploads.

## Minimum restore test
- Admin can log in.
- A teacher can see students/classes.
- A parent can see only their child.
- Report history opens.
- Media assets open through `/api/media/:token` or Cloudinary URLs.

## Operational rule
A backup is not proven until a restore has been tested.
