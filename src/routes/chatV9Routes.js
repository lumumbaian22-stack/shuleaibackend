const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const chat = require('../controllers/chatV9Controller');
const { requireFeature } = require('../middleware/featureGate');
router.use(protect);

router.get('/departments', requireFeature('departments'), chat.listDepartments);
router.get('/departments/:departmentId/group', requireFeature('departments'), chat.getDepartmentGroup);
router.post('/departments', requireFeature('departments'), chat.createDepartment);
router.put('/departments/:departmentId', requireFeature('departments'), chat.updateDepartment);
router.delete('/departments/:departmentId', requireFeature('departments'), chat.deleteDepartment);

router.get('/teachers', chat.listTeacherDirectory);

router.get('/teacher/groups', chat.listTeacherGroups);
router.post('/teacher/groups', chat.createTeacherGroup);
router.get('/teacher/available-members', chat.listAvailableMembers);
router.get('/teacher/groups/:groupId/members', chat.listGroupMembers);
router.put('/teacher/groups/:groupId/members', chat.updateGroupMembers);

router.get('/teacher/direct/:userId', chat.getDirectMessages);
router.post('/teacher/direct', chat.sendDirectMessage);
router.get('/student/direct/:userId', chat.getStudentDirectMessages);
router.post('/student/direct', chat.sendStudentDirectMessage);

router.get('/teacher/groups/:groupId/messages', chat.getGroupMessages);
router.post('/teacher/groups/:groupId/messages', chat.sendGroupMessage);

router.get('/classroom/threads', chat.listClassroomThreads);
router.post('/classroom/threads', chat.createClassroomThread);
router.put('/classroom/threads/:threadId', chat.updateClassroomThread);
router.post('/classroom/threads/:threadId/replies', chat.replyToThread);

router.put('/messages/:messageId', chat.editChatMessage);
router.delete('/messages/:messageId', chat.deleteChatMessage);
router.put('/classroom/replies/:replyId', chat.editThreadReply);
router.delete('/classroom/replies/:replyId', chat.deleteThreadReply);

router.post('/classroom/replies/:replyId/award', chat.awardThreadReply);
router.post('/classroom/replies/:replyId/pin', chat.pinThreadReply);
router.post('/teacher/messages/:messageId/award', chat.awardChatMessage);
router.post('/teacher/messages/:messageId/react', chat.reactToMessage);
router.post('/attachments', chat.uploadAttachment);

router.get('/achievements/me', chat.myAchievements);

module.exports = router;
