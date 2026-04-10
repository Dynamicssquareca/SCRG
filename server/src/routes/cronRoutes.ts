import { Router, Request, Response } from 'express';
import { processReminders } from '../services/reminderService';
import { successResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /cron/reminders
 * Triggered by Vercel Cron Jobs (daily on free plan) to process contract reminders.
 * Secured via CRON_SECRET header so only Vercel can invoke it.
 * Uses dailyMode=true to process ALL due reminders in one shot (ignores per-client send_time).
 */
router.get('/reminders', async (req: Request, res: Response) => {
  // Verify the cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized cron request attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    logger.info('[Vercel Cron] Running reminder scan...');
    await processReminders();
    logger.info('[Vercel Cron] Reminder scan completed.');
    successResponse(res, { message: 'Reminders processed successfully', timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error('[Vercel Cron] Reminder scan failed:', err);
    res.status(500).json({ error: 'Reminder processing failed', details: err.message });
  }
});

export default router;

