import mongoose from 'mongoose';
import { env } from './env';
import logger from '../utils/logger';

export const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    // Suppress findAndModify deprecation notice
    mongoose.set('returnDocument', 'after');
    const conn = await mongoose.connect(env.MONGODB_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${(error as Error).message}`);
    process.exit(1);
  }
};
