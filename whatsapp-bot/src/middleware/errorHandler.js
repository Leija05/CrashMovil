import { logger } from '../config/logger.js';

export function errorHandler(error, _req, res, _next) {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({ ok: false, message: error.message || 'Internal server error' });
}
