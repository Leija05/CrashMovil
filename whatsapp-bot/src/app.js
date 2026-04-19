import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined'));
  app.use(apiRateLimiter);

  app.use(router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
