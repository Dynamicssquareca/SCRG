import { Router } from 'express';
import * as userMgmt from '../controllers/userManagementController';
import { authMiddleware } from '../middleware/authMiddleware';
import { ForbiddenError } from '../utils/apiResponse';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// All routes require authentication + admin role
router.use(authMiddleware);
router.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') return next(new ForbiddenError('Admin access required'));
  next();
});

router.get('/',              userMgmt.listUsers);
router.delete('/:id/totp',  userMgmt.revokeTotp);
router.get('/:id/qr-code',  userMgmt.getQrCode);

export default router;

