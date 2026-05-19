import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/stats',                dashboardController.getStats);
router.get('/cases',                dashboardController.getCases);
router.get('/last-upload',          dashboardController.getLastUpload);
router.get('/consultant-workload',  dashboardController.getConsultantWorkload);
router.get('/chart/custom-comparison', dashboardController.getCustomComparisonChart);
router.get('/chart/client-breakdown',  dashboardController.getClientBreakdownChart);

export default router;
