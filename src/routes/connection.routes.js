import { Router } from 'express';
import { requestConnection } from '../controllers/connection.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/request', authMiddleware, requestConnection);

export default router;

