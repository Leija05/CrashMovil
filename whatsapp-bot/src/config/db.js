import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase() {
  await mongoose.connect(env.mongoUrl, { dbName: env.dbName });
  logger.info('MongoDB connected', { dbName: env.dbName });
}
