const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const chat = require('../controllers/chatV9Controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const attachmentDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(attachmentDir)) fs.mkdirSync(attachmentDir, { recursive: true });
const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, attachmentDir),
    filename: (req, file, cb) => cb(null, `chat-${req.user.id}-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname || '')}`)
  }),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE || 52428800) }
});

router.use(protect);

router.get('/departments', chat.listDepartments);
router.get('/departments/:departmentId/group', chat.getDepartmentGroup);
router.post('/departments', chat.createDepartment);
router.put('/departments/:departmentId', chat.updateDepartment);
router.delete('/departments/:departmentId', chat.deleteDepartment);

router.get('/teachers', chat.listTeacherDirectory);

router.get('/teacher/groups', chat.listTeacherGroups);
router.post('/teacher/groups', chat.createTeacherGroup);
router.get('/teacher/available-members', chat.listAvailableMembers);
router.get('/teacher/groups/:groupId/members', chat.listGroupMembers);
router.put('/teacher/groups/:groupId/members', chat.updateGroupMembers);

router.get('/teacher/direct/:userId', chat.getDirectMessages);
router.post('/teacher/direct', chat.sendDirectMessage);

router.get('/teacher/groups/:groupId/messages', chat.getGroupMessages);
router.post('/teacher/groups/:groupId/messages', chat.sendGroupMessage);

router.get('/classroom/threads', chat.listClassroomThreads);
router.post('/classroom/threads', chat.createClassroomThread);
router.put('/classroom/threads/:threadId', chat.updateClassroomThread);
router.post('/classroom/threads/:threadId/replies', chat.replyToThread);

router.post('/classroom/replies/:replyId/award', chat.awardThreadReply);
router.post('/teacher/messages/:messageId/award', chat.awardChatMessage);
router.post('/teacher/messages/:messageId/react', chat.reactToMessage);
router.post('/messages/:messageId/read', chat.markMessageRead);
router.post('/messages/:messageId/react', chat.reactToMessage);
router.post('/messages/:messageId/report', chat.reportMessage);
router.post('/classroom/replies/:replyId/react', chat.reactToReply);
router.post('/classroom/replies/:replyId/report', chat.reportReply);
router.post('/presence', chat.updatePresence);
router.get('/presence', chat.getPresence);
router.post('/typing', chat.updateTyping);
router.get('/typing', chat.getTyping);
router.get('/search', chat.searchMessages);
router.post('/attachments', attachmentUpload.single('file'), chat.uploadAttachment);

router.get('/achievements/me', chat.myAchievements);

module.exports = router;
