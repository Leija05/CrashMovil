const crypto = require('crypto');

function generateOtp(length = 6) {
  const max = 10 ** length;
  const min = 10 ** (length - 1);
  return String(crypto.randomInt(min, max));
}

function hashOtp(value) {
  const secret = process.env.JWT_SECRET || 'unsafe-dev-secret';
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function isExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

module.exports = { generateOtp, hashOtp, isExpired };
