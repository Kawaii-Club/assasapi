import { Router } from 'express';
import { sendPushNotification } from '../services/notification.service.js';

const router = Router();

router.get('/test-notification/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const response = await sendPushNotification({
      toUserId: userId,
      title: 'Teste Kawaii Club 🎉',
      body: 'Esta é uma notificação de teste enviada pelo backend!',
      data: { type: 'test_notification' },
    });

    res.json({ success: true, response });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;