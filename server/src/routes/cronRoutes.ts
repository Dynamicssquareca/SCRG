import { Router, Request, Response } from 'express';
import { processReminders } from '../services/reminderService';
import { successResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /cron/reminders
 * Called in two scenarios:
 *   1. Vercel built-in cron (once/day) → ?dailyMode=true → ignores per-client send_time, sends all due emails
 *   2. External pinger (every 10 min)   → ?dailyMode=false (default) → checks send_time window precisely
 * Secured via CRON_SECRET header so only authorised callers can invoke it.
 */
router.get('/reminders', async (req: Request, res: Response) => {
  // Verify the cron secret to prevent unauthorized access
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers['authorization'] || '').trim();
  const expected = `Bearer ${cronSecret}`;

  logger.info(`[Cron Auth] Header present: ${!!authHeader}, Secret configured: ${!!cronSecret}`);

  if (cronSecret && authHeader !== expected) {
    logger.warn(`[Cron Auth] Mismatch. Got: "${authHeader.substring(0, 20)}..." Expected: "${expected.substring(0, 20)}..."`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // dailyMode=true → skip time-of-day check (Vercel once-per-day sweep)
  // dailyMode=false → enforce 10-min send_time window (external pinger)
  const dailyMode = req.query.dailyMode === 'true';

  try {
    logger.info(`[Vercel Cron] Running reminder scan (dailyMode=${dailyMode})...`);
    await processReminders(dailyMode);
    logger.info('[Vercel Cron] Reminder scan completed.');
    successResponse(res, { message: 'Reminders processed successfully', timestamp: new Date().toISOString(), dailyMode });
  } catch (err: any) {
    logger.error('[Vercel Cron] Reminder scan failed:', err);
    res.status(500).json({ error: 'Reminder processing failed', details: err.message });
  }
});

/**
 * GET /cron/monthly-report
 * Called by Vercel Cron once per day.
 * processMonthlyReports() internally checks whether it's the configured
 * send_day and the right time window before dispatching - so running it
 * daily is safe; it simply does nothing on non-trigger days.
 */
router.get('/monthly-report', async (req: Request, res: Response) => {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers['authorization'] || '').trim();
  const expected = `Bearer ${cronSecret}`;

  if (cronSecret && authHeader !== expected) {
    logger.warn('[Cron Auth] Monthly report - unauthorized call rejected.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dailyMode = req.query.dailyMode === 'true';

  try {
    logger.info(`[Vercel Cron] Running monthly report scheduler (dailyMode=${dailyMode})...`);
    // Use require() instead of import() - ESM dynamic imports need .js extensions
    // in compiled CJS output which Vercel doesn't handle automatically
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processMonthlyReports } = require('../services/monthlyReportSchedulerService');
    // cronMode=true: trust cron-job.org for timing, only check day + duplicate guard
    await processMonthlyReports(false, !dailyMode, dailyMode);
    logger.info('[Vercel Cron] Monthly report scheduler completed.');
    successResponse(res, { message: 'Monthly report check completed', timestamp: new Date().toISOString(), dailyMode });
  } catch (err: any) {
    logger.error('[Vercel Cron] Monthly report scheduler failed:', err);
    res.status(500).json({ error: 'Monthly report processing failed', details: err.message });
  }
});

export default router;

