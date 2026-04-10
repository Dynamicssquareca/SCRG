import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  listClientAccess,
  createClientAccess,
  resetClientPassword,
  revokeClientAccess,
} from '../controllers/clientAccessController';

const router = Router();

router.use(authMiddleware);

router.get('/', listClientAccess);
router.post('/', createClientAccess);
router.put('/:userId/reset-password', resetClientPassword);
router.delete('/:userId', revokeClientAccess);

export default router;
