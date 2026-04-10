router.get('/alerts', protect, alertController.getMyAlerts);
router.put('/alerts/:id/read', protect, alertController.markAlertAsRead);
