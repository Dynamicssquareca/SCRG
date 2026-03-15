import { Router } from 'express';
import * as uploadController from '../controllers/uploadController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

const router = Router();

router.use(authMiddleware);
router.post('/', requireRole('admin', 'operator'), uploadMiddleware.single('file'), uploadController.create);
router.get('/', uploadController.getAll);
router.get('/:id', uploadController.getById);

export default router;
