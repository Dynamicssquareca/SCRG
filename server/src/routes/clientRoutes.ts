import { Router } from 'express';
import * as clientController from '../controllers/clientController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/', clientController.getAll);
router.get('/:id', clientController.getById);
router.post('/', requireRole('admin'), clientController.create);
router.put('/:id', requireRole('admin'), clientController.update);
router.delete('/:id', requireRole('admin'), clientController.remove);

export default router;
