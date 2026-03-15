import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://gopalk:Gopal1234@cluster0.stdt1sf.mongodb.net/?appName=Cluster0',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'default_access_secret',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret',
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || './storage/uploads'),
  REPORT_DIR: path.resolve(process.env.REPORT_DIR || './storage/reports'),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
