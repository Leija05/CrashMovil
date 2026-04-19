import { User } from '../models/User.js';
import { createOtp, verifyOtp } from '../services/otpService.js';
import { sendOtpToEmergencyContact } from '../services/whatsappClient.js';
import { normalizePhone } from '../utils/phone.js';
import { reportQueue } from '../queues/index.js';

export async function registerUser(req, res, next) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const emergencyPhone = normalizePhone(req.body.emergencyPhone);

    await User.updateOne(
      { userPhone },
      {
        $set: {
          userPhone,
          emergencyPhone,
          verified: false,
          verifiedAt: null
        }
      },
      { upsert: true }
    );

    const { code, expiresAt } = await createOtp(userPhone, emergencyPhone);
    await sendOtpToEmergencyContact(emergencyPhone, code, userPhone);

    res.status(201).json({
      ok: true,
      message: 'OTP enviado al contacto de emergencia',
      expiresAt
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmOtp(req, res, next) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const code = String(req.body.code || '').trim();

    const result = await verifyOtp(userPhone, code);
    if (!result.ok) {
      return res.status(400).json({ ok: false, ...result });
    }

    return res.json({ ok: true, message: 'Número verificado correctamente' });
  } catch (error) {
    return next(error);
  }
}

export async function sendReport(req, res, next) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const user = await User.findOne({ userPhone });

    if (!user || !user.verified) {
      return res.status(403).json({ ok: false, message: 'Usuario no verificado' });
    }

    const payload = {
      to: userPhone,
      report: String(req.body.report || ''),
      diagnosis: String(req.body.diagnosis || ''),
      lat: Number(req.body.lat),
      lng: Number(req.body.lng)
    };

    const job = await reportQueue.add('sendReport', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 4000 },
      removeOnComplete: 100,
      removeOnFail: 100
    });

    return res.status(202).json({ ok: true, jobId: job.id, message: 'Reporte en cola para envío' });
  } catch (error) {
    return next(error);
  }
}
