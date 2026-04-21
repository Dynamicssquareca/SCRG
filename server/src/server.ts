import app from './app';
import { env } from './config/env';
import { connectDB } from './config/database';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';
import { User } from './models/User';
import { initScheduler } from './scheduler';

// Ensure storage directories exist
const dirs = [env.UPLOAD_DIR, env.REPORT_DIR, path.dirname(path.join(__dirname, '../data/scrg.db'))];
dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function start() {
  try {
    await connectDB();
    logger.info('Database connected successfully');

    // Check if admin user exists, if not run seed
    const adminExists = await User.findOne({ email: 'admin-ds@dynamicssquare.com' });
    if (!adminExists) {
      await User.create({
        email: 'admin-ds@dynamicssquare.com',
        password_hash: 'Admin-ds@2026',
        full_name: 'Administrator',
        role: 'admin',
      });
      logger.info('Database seeded with admin user');
    }

    // Start background jobs
    await initScheduler();

    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      logger.info(`API available at http://localhost:${env.PORT}/api/v1`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
