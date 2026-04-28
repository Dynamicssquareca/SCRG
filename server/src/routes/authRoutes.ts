import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticateTempToken } from '../middleware/tempAuth';

const router = Router();

router.post('/login', authController.login);
router.post('/setup-totp', authenticateTempToken, authController.setupTotp);
router.post('/verify-totp-setup', authenticateTempToken, authController.verifyTotpSetup);
router.post('/verify-totp', authenticateTempToken, authController.verifyTotp);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/reveal-qr', authController.revealQr);

export default router;
