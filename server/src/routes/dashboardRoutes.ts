import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import * as reportSettingsController from '../controllers/reportSettingsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/stats',                dashboardController.getStats);
router.get('/cases',                dashboardController.getCases);
router.get('/last-upload',          dashboardController.getLastUpload);
router.get('/consultant-workload',  dashboardController.getConsultantWorkload);
router.get('/chart/custom-comparison', dashboardController.getCustomComparisonChart);
router.get('/chart/client-breakdown',  dashboardController.getClientBreakdownChart);
router.get('/reachouts',                dashboardController.getReachouts);
router.post('/reachouts/:id/resolve',   dashboardController.resolveReachout);

// Monthly PDF Report Scheduler Endpoints
router.get('/report/settings',              reportSettingsController.getReportSettings);
router.post('/report/settings',             reportSettingsController.saveReportSettings);
router.get('/report/preview',               reportSettingsController.getReportPreview);
router.post('/report/test-send',            reportSettingsController.testSendReport);
router.get('/report/recipient-suggestions', reportSettingsController.getRecipientSuggestions);
router.post('/report/recipient-suggestions/remove', reportSettingsController.removeRecipientSuggestion);

export default router;
