const mongoose = require('mongoose');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');

async function start() {
  await mongoose.connect(env.mongoUrl, { dbName: env.dbName });
  logger.info('MongoDB connected');

  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

start().catch((error) => {
  logger.error({ error: error.message }, 'Server failed to start');
  process.exit(1);
});
