import { Router } from 'express';
import authRoutes from './authRoutes';
import clientRoutes from './clientRoutes';
import uploadRoutes from './uploadRoutes';
import reportRoutes from './reportRoutes';
import dashboardRoutes from './dashboardRoutes';
import usageRoutes from './usageRoutes';
import adminRoutes from './adminRoutes';
import notificationRoutes from './notificationRoutes';
import reminderRoutes from './reminderRoutes';
import clientPortalRoutes from './clientPortalRoutes';
import clientAccessRoutes from './clientAccessRoutes';
import cronRoutes from './cronRoutes';
import userManagementRoutes from './userManagementRoutes';

const router = Router();

router.use('/usage', usageRoutes);
router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/uploads', uploadRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reminders', reminderRoutes);
router.use('/client-portal', clientPortalRoutes);
router.use('/client-access', clientAccessRoutes);
router.use('/cron', cronRoutes);
router.use('/users', userManagementRoutes);

export default router;


