import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getClientDashboard, downloadClientReport, createReachout, getMyReachouts, deleteReachout } from '../controllers/clientPortalController';

const router = Router();

// All client-portal routes require authentication
router.use(authMiddleware);

router.get('/dashboard', getClientDashboard);
router.get('/report/download', downloadClientReport);
router.post('/reachout', createReachout);
router.get('/reachouts', getMyReachouts);
router.delete('/reachouts/:id', deleteReachout);

export default router;
