import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sendEmergencyReport } from '../services/reportService.js';

const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

export const reportQueue = new Queue('reportQueue', { connection: redis });

export function startQueueWorker() {
  const worker = new Worker(
    'reportQueue',
    async (job) => {
      logger.info('Processing report job', { jobId: job.id, userPhone: job.data.to });
      await sendEmergencyReport(job.data);
    },
    { connection: redis }
  );

  worker.on('completed', (job) => logger.info('Report job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Report job failed', { jobId: job?.id, error: err.message }));

  return worker;
}
