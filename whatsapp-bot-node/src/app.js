const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.allowedOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api', routes);

app.use((err, req, res, next) => {
  req.log.error({ err: err.message }, 'Unhandled error');
  res.status(500).json({ error: 'Unexpected server error' });
});

module.exports = app;
