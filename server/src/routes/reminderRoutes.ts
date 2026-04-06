import { Router } from 'express';
import * as reminderController from '../controllers/reminderController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';

const router = Router();

// All reminder operations require admin access
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', reminderController.getReminders);
router.post('/:id', reminderController.saveReminderSetting);
router.post('/:id/test', reminderController.sendTest);

router.get('/logs', reminderController.getLogs);
router.delete('/logs', reminderController.deleteLogs);

export default router;
