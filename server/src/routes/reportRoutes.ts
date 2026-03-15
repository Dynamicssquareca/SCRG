import { Router } from 'express';
import * as reportController from '../controllers/reportController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';

const router = Router();

router.use(authMiddleware);
router.post('/generate', requireRole('admin', 'operator'), reportController.generate);
router.get('/', reportController.getAll);
router.get('/download-all', reportController.downloadAll);
router.get('/:id/download', reportController.download);

export default router;
