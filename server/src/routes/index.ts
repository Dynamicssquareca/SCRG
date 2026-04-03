import { Router } from 'express';
import authRoutes from './authRoutes';
import clientRoutes from './clientRoutes';
import uploadRoutes from './uploadRoutes';
import reportRoutes from './reportRoutes';
import dashboardRoutes from './dashboardRoutes';
import usageRoutes from './usageRoutes';
import adminRoutes from './adminRoutes';
import notificationRoutes from './notificationRoutes';

const router = Router();

router.use('/usage', usageRoutes);
router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/uploads', uploadRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);

export default router;
