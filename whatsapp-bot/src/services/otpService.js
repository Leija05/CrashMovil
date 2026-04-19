import crypto from 'crypto';
import { OtpToken } from '../models/OtpToken.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function createOtp(userPhone, emergencyPhone) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + env.otpTtlMinutes * 60 * 1000);

  await OtpToken.updateMany(
    { userPhone, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  await OtpToken.create({
    userPhone,
    emergencyPhone,
    otpHash: hashOtp(code),
    expiresAt,
    maxAttempts: env.otpMaxAttempts
  });

  return { code, expiresAt };
}

export async function verifyOtp(userPhone, code) {
  const otp = await OtpToken.findOne({ userPhone, consumedAt: null }).sort({ createdAt: -1 });
  if (!otp) {
    return { ok: false, reason: 'No active OTP found' };
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'OTP expired' };
  }

  if (otp.attempts >= otp.maxAttempts) {
    return { ok: false, reason: 'Max attempts reached' };
  }

  const matches = hashOtp(code) === otp.otpHash;
  if (!matches) {
    otp.attempts += 1;
    await otp.save();
    return { ok: false, reason: 'Invalid OTP', attempts: otp.attempts };
  }

  otp.consumedAt = new Date();
  await otp.save();

  await User.updateOne(
    { userPhone },
    {
      $set: {
        verified: true,
        verifiedAt: new Date()
      },
      $inc: { verificationAttempts: 1 }
    }
  );

  return { ok: true };
}
