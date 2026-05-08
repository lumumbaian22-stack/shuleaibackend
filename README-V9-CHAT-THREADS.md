# Shule AI Backend V9 - Chat, Groups, Classroom Threads, Achievements

## New backend features

### Departments
- Admin can create departments.
- Teachers can be assigned to departments.
- A department chat group is automatically created when a department is created.

### Teacher-to-teacher chat
- Direct teacher-to-teacher messages.
- Group chats.
- Automatic Staff Room group.
- Teacher-created project/committee groups.

### Classroom Threads
- Teacher/admin can create structured classroom discussion threads.
- Students can reply under the thread.
- Teacher replies are highlighted on frontend.

### Points / Streaks / Achievements
- Teachers/admins can award points and streaks on:
  - Student thread replies
  - Student/group chat messages
- Awards are saved as AchievementEvents.
- Student dashboard can display total points/streak and recent achievements.

## New API base

```txt
/api/chat-v9
```

## Deploy order

1. Deploy backend V9.
2. Run:

```bash
npm run migrate
```

3. Restart backend service.
4. Deploy frontend V9.

## Important

This adds new modules without deleting old message features.
