import app from './app';
import { env } from './config/env';
import { connectDB } from './config/database';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
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

    // Upsert admin user - always sync credentials from code to DB on startup
    // Must hash manually since findOneAndUpdate bypasses Mongoose pre-save hooks
    const ADMIN_PASSWORD = 'Admin-ds@2026';
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.findOneAndUpdate(
      { email: 'admin-ds@dynamicssquare.com' },
      {
        email: 'admin-ds@dynamicssquare.com',
        password_hash: hashedPassword,
        full_name: 'Administrator',
        role: 'admin',
      },
      { upsert: true, new: true }
    );
    logger.info('Admin user credentials synced');

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
