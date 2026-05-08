# Shule AI v14 National Rollout - School Operations Build

This build is designed for school operations with real money collection disabled.

## Active / implemented school workflows
- Authentication and role dashboards
- School/admin/teacher/student/parent data views
- Teacher lifecycle actions: activate, reactivate, deactivate, suspend, delete
- Class student list endpoint
- Student expel/remove-from-active-roll endpoint
- Academic marks summaries for parent and student views
- Student GPA, subject performance, and class ranking endpoints
- Grade-aware learning-materials generator
- Calendar, timetable, homework, duty, alerts, chat-v9, gamification and analytics routes remain mounted
- Super-admin user, metrics, logs, school stats and request history endpoints added

## Real money collection
Real money collection is intentionally disabled. The following flows return 503 or are blocked in the UI:
- Daraja STK push
- Parent fee payment
- Subscription upgrade payment
- Platform payment
- Name-change payment
- Parent payment confirmation

Enable payments only after a separate live Daraja settlement audit.
