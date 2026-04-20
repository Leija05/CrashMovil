const User = require('../models/User');
const OtpToken = require('../models/OtpToken');
const EventLog = require('../models/EventLog');
const env = require('../config/env');
const { generateOtp, hashOtp, isExpired } = require('../utils/otp');
const { normalizePhone, isLikelyE164 } = require('../utils/phone');
const { enqueueText } = require('../services/queueService');

async function registerUser(req, res) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const emergencyPhone = normalizePhone(req.body.emergencyPhone);

    if (!isLikelyE164(userPhone) || !isLikelyE164(emergencyPhone)) {
      return res.status(400).json({ error: 'userPhone and emergencyPhone must be E.164 format' });
    }

    const otp = generateOtp(6);
    const expiresAt = new Date(Date.now() + env.otpTtlMinutes * 60 * 1000);

    const user = await User.findOneAndUpdate(
      { userPhone },
      { userPhone, emergencyPhone, verified: false },
      { upsert: true, new: true }
    );

    await OtpToken.create({
      userPhone,
      emergencyPhone,
      codeHash: hashOtp(otp),
      expiresAt,
    });

    const message = `Código de verificación C.R.A.S.H.: ${otp}. Compártelo únicamente con el usuario para completar verificación. Expira en ${env.otpTtlMinutes} minutos.`;

    await enqueueText(emergencyPhone, message);

    await EventLog.create({
      type: 'otp_sent',
      userPhone,
      emergencyPhone,
      payload: { expiresAt },
    });

    return res.status(201).json({
      message: 'Usuario registrado. OTP enviado a contacto de emergencia.',
      user: {
        userPhone: user.userPhone,
        emergencyPhone: user.emergencyPhone,
        verified: user.verified,
      },
      otpExpiresAt: expiresAt,
    });
  } catch (error) {
    await EventLog.create({ type: 'otp_sent', status: 'error', error: error.message, payload: req.body });
    return res.status(500).json({ error: 'Failed to register and send OTP', detail: error.message });
  }
}

async function verifyOtp(req, res) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const otp = String(req.body.otp || '').trim();

    const user = await User.findOne({ userPhone });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = await OtpToken.findOne({ userPhone, consumedAt: null }).sort({ createdAt: -1 });
    if (!token) return res.status(404).json({ error: 'OTP not found' });

    if (isExpired(token.expiresAt)) {
      return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    }

    if (token.attempts >= env.otpMaxAttempts) {
      return res.status(429).json({ error: 'Max OTP attempts reached. Request a new OTP.' });
    }

    const hashed = hashOtp(otp);
    if (hashed !== token.codeHash) {
      token.attempts += 1;
      await token.save();
      return res.status(400).json({ error: 'Invalid OTP', attemptsLeft: env.otpMaxAttempts - token.attempts });
    }

    token.consumedAt = new Date();
    await token.save();

    user.verified = true;
    user.verifiedAt = new Date();
    user.verificationRetries = token.attempts;
    await user.save();

    await EventLog.create({ type: 'otp_verified', userPhone, emergencyPhone: user.emergencyPhone });

    return res.json({ message: 'Número verificado correctamente', verified: true, userPhone });
  } catch (error) {
    await EventLog.create({ type: 'otp_verified', status: 'error', error: error.message, payload: req.body });
    return res.status(500).json({ error: 'Failed to verify OTP', detail: error.message });
  }
}

module.exports = { registerUser, verifyOtp };
