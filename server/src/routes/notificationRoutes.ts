import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.get('/', notificationController.getNotifications);

export default router;
