# Shule AI Backend V6 Chat/Profile

Adds/fixes:
- Safe public user profile endpoint with profileImage.
- Admin student/teacher APIs include profileImage in User includes.
- Messaging includes sender/recipient profileImage where controllers use User attributes.
- Student class member endpoint:
  - `GET /api/student/chat/class-members`
- Student class-scoped group chat:
  - `GET /api/student/chat/class-group-messages`
  - `POST /api/student/chat/class-group-message`
- Student private chat restricted to classmates:
  - `GET /api/student/chat/private-messages/:otherUserId`
  - `POST /api/student/chat/private-message`
- Runtime schema safety for message group fields.

Deploy backend V6, run `npm run migrate`, restart Render, then replace frontend V6.