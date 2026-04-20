const dotenv = require('dotenv');

dotenv.config();

const required = [
  'MONGO_URL',
  'DB_NAME',
  'WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  mongoUrl: process.env.MONGO_URL,
  dbName: process.env.DB_NAME,
  redisUrl: process.env.REDIS_URL || '',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || 'emergency_alert',
  whatsappTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX',
  templateFallbackOn24h: process.env.WHATSAPP_TEMPLATE_FALLBACK_ON_24H === 'true',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
};
