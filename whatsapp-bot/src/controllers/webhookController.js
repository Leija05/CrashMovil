import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { User } from '../models/User.js';
import { verifyOtp } from '../services/otpService.js';

function extractIncomingMessages(body) {
  const entries = body.entry || [];
  const messages = [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        messages.push(message);
      }
    }
  }

  return messages;
}

export async function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.webhookVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

export async function receiveWebhook(req, res, next) {
  try {
    const messages = extractIncomingMessages(req.body);

    for (const message of messages) {
      const from = message.from;
      const text = (message.text?.body || '').trim();
      logger.info('Inbound WhatsApp message', { from, text });

      const match = text.match(/^ACEPTO\s+(\d{6})$/i);
      if (!match) {
        continue;
      }

      const code = match[1];
      const linkedUser = await User.findOne({ emergencyPhone: from, verified: false }).sort({ updatedAt: -1 });
      if (!linkedUser) {
        continue;
      }

      const result = await verifyOtp(linkedUser.userPhone, code);
      logger.info('Emergency-side OTP verification result', { userPhone: linkedUser.userPhone, ok: result.ok });
    }

    return res.sendStatus(200);
  } catch (error) {
    return next(error);
  }
}
