const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const chat = require('../controllers/chatV9Controller');

router.use(protect);

router.get('/departments', chat.listDepartments);
router.post('/departments', chat.createDepartment);
router.put('/departments/:departmentId', chat.updateDepartment);
router.delete('/departments/:departmentId', chat.deleteDepartment);

router.get('/teachers', chat.listTeacherDirectory);

router.get('/teacher/groups', chat.listTeacherGroups);
router.post('/teacher/groups', chat.createTeacherGroup);

router.get('/teacher/direct/:userId', chat.getDirectMessages);
router.post('/teacher/direct', chat.sendDirectMessage);

router.get('/teacher/groups/:groupId/messages', chat.getGroupMessages);
router.post('/teacher/groups/:groupId/messages', chat.sendGroupMessage);

router.get('/classroom/threads', chat.listClassroomThreads);
router.post('/classroom/threads', chat.createClassroomThread);
router.post('/classroom/threads/:threadId/replies', chat.replyToThread);

router.post('/classroom/replies/:replyId/award', chat.awardThreadReply);
router.post('/teacher/messages/:messageId/award', chat.awardChatMessage);

router.get('/achievements/me', chat.myAchievements);

module.exports = router;
