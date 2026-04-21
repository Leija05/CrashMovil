const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const env = require('../config/env');
const logger = require('../config/logger');
const { sendTextMessage, sendLocationMessage } = require('./whatsappService');

let queue = null;

if (env.redisUrl) {
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue('whatsapp-outbound', { connection });

  const worker = new Worker(
    'whatsapp-outbound',
    async (job) => {
      if (job.name === 'text') {
        return sendTextMessage(job.data.to, job.data.body);
      }
      if (job.name === 'location') {
        const { to, latitude, longitude, name, address } = job.data;
        return sendLocationMessage(to, latitude, longitude, name, address);
      }
      throw new Error(`Unknown job: ${job.name}`);
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Queue job failed');
  });
}

async function enqueueText(to, body) {
  if (!queue) return sendTextMessage(to, body);
  return queue.add('text', { to, body }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

async function enqueueLocation(to, latitude, longitude, name, address) {
  if (!queue) return sendLocationMessage(to, latitude, longitude, name, address);
  return queue.add('location', { to, latitude, longitude, name, address }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

module.exports = {
  queueEnabled: Boolean(queue),
  enqueueText,
  enqueueLocation,
};
