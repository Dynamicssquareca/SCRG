import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getClientDashboard, downloadClientReport } from '../controllers/clientPortalController';

const router = Router();

// All client-portal routes require authentication
router.use(authMiddleware);

router.get('/dashboard', getClientDashboard);
router.get('/report/download', downloadClientReport);

export default router;
