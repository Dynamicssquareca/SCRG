import * as cron from 'node-cron';
import { processReminders } from './services/reminderService';
import logger from './utils/logger';

let currentTask: cron.ScheduledTask | null = null;
const DEFAULT_CRON = '* * * * *'; // Run every single minute

export async function initScheduler() {
  try {
    // Stop existing task if any
    if (currentTask) {
      currentTask.stop();
    }

    startCronJob(DEFAULT_CRON);
  } catch (err) {
    logger.error('Failed to initialize scheduler', err);
    startCronJob(DEFAULT_CRON);
  }
}

function startCronJob(schedule: string) {
  logger.info(`Starting reminder scheduler with cron: [${schedule}]`);
  
  currentTask = cron.schedule(schedule, async () => {
    await processReminders();
  });
}

export async function restartScheduler() {
  logger.info('Restarting scheduler due to settings change...');
  await initScheduler();
}
