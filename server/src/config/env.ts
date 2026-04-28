import dotenv from 'dotenv';
import path from 'path';

// Always force-load .env during development to ensure settings like SMTP aren't missed
const envPath = path.resolve(__dirname, '../../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`[WARNING] Failed to load .env from ${envPath}`);
} else {
  console.log(`[INFO] Loaded .env configuration`);
}

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || '',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || '',
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || './storage/uploads'),
  REPORT_DIR: path.resolve(process.env.REPORT_DIR || './storage/reports'),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.office365.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  STATIC_AUTH_PASSCODE: process.env.STATIC_AUTH_PASSCODE || 'Dynamicshash2026',
};

// Critical validation for production
if (env.NODE_ENV === 'production') {
  const missingVars = [];
  if (!env.MONGODB_URI) missingVars.push('MONGODB_URI');
  if (!env.ACCESS_TOKEN_SECRET) missingVars.push('ACCESS_TOKEN_SECRET');
  if (!env.REFRESH_TOKEN_SECRET) missingVars.push('REFRESH_TOKEN_SECRET');

  if (missingVars.length > 0) {
    console.error(`[CRITICAL] Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('The application will fail to start or functionality will be broken.');
  }
}
