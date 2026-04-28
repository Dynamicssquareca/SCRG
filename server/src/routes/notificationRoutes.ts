import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/', notificationController.getNotifications);
router.get('/center', notificationController.getNotificationCenter);

export default router;
