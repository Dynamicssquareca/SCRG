import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/stats', dashboardController.getStats);
router.get('/cases', dashboardController.getCases);

export default router;
