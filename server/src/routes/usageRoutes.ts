import { Router } from 'express';
import * as usageController from '../controllers/usageController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/monthly-consumption', usageController.getMonthlyConsumption);
router.get('/monthly', usageController.getMonthlyUsage);
router.get('/balance-grid', usageController.getBalanceGrid);
router.get('/usage-grid', usageController.getUsageGrid);

export default router;
