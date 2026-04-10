import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  listClientAccess,
  createClientAccess,
  resetClientPassword,
  revokeClientAccess,
  grantAgainClientAccess,
  deleteClientAccess,
} from '../controllers/clientAccessController';

const router = Router();

router.use(authMiddleware);

router.get('/', listClientAccess);
router.post('/', createClientAccess);
router.put('/:userId/reset-password', resetClientPassword);
router.put('/:userId/grant-again', grantAgainClientAccess);
router.delete('/:userId', revokeClientAccess);
router.delete('/:userId/permanent', deleteClientAccess);

export default router;
