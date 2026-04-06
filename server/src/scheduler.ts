import * as cron from 'node-cron';
import { processReminders } from './services/reminderService';
import { AppSetting } from './models/AppSetting';
import logger from './utils/logger';

let currentTask: cron.ScheduledTask | null = null;
const DEFAULT_CRON = '0 9 * * *'; // Default 9:00 AM daily

/**
 * Initializes the background scheduler.
 * Reads the configured cron expression from the database (or uses default),
 * and starts the job.
 */
export async function initScheduler() {
  try {
    let setting = await AppSetting.findOne({ key: 'reminder_cron_schedule' });
    
    // If not set yet, create default 9:00 AM
    if (!setting) {
      setting = await AppSetting.create({
        key: 'reminder_cron_schedule',
        value: DEFAULT_CRON,
      });
    }

    const scheduleExpr = setting.value as string;
    
    // Stop existing task if any
    if (currentTask) {
      currentTask.stop();
    }

    // Validate logic
    if (!cron.validate(scheduleExpr)) {
      logger.error(`Invalid cron expression in DB: ${scheduleExpr}. Falling back to default.`);
      startCronJob(DEFAULT_CRON);
    } else {
      startCronJob(scheduleExpr);
    }
    
  } catch (err) {
    logger.error('Failed to initialize scheduler', err);
    // Fallback if DB fails
    startCronJob(DEFAULT_CRON);
  }
}

function startCronJob(schedule: string) {
  logger.info(`Starting reminder scheduler with cron: [${schedule}]`);
  
  currentTask = cron.schedule(schedule, async () => {
    logger.info('Cron triggered: Running daily reminder processing...');
    await processReminders();
  });
}

/**
 * Exported so the controller can restart the cron job when user saves a new time
 */
export async function restartScheduler() {
  logger.info('Restarting scheduler due to settings change...');
  await initScheduler();
}
