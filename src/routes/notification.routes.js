import { Router } from 'express';
import { sendNotification } from '../controllers/notification.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// 🔔 envio real de push
// routes/notification.routes.js
router.post('/send', sendNotification);
// 🔔 teste (opcional)
router.post('/test', authMiddleware, sendNotification);

export default router;