import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { getClientDashboardPreview } from '../controllers/clientPortalController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';

const router = Router();

// Protect with auth and admin role
router.use(authMiddleware);
router.use(requireRole('admin'));

router.post('/clear-all-data', adminController.clearAllData);
router.get('/client-dashboard-preview', getClientDashboardPreview);

export default router;

