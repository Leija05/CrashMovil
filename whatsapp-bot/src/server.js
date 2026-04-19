import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { logger } from './config/logger.js';
import { startQueueWorker } from './queues/index.js';

async function bootstrap() {
  await connectDatabase();
  startQueueWorker();

  const app = createApp();
  app.listen(env.port, () => {
    logger.info('WhatsApp bot server running', { port: env.port, env: env.nodeEnv });
  });
}

bootstrap();
