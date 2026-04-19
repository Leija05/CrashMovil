import axios from 'axios';
import { env } from '../config/env.js';

const baseUrl = `https://graph.facebook.com/${env.whatsappApiVersion}/${env.whatsappPhoneNumberId}/messages`;

async function send(payload) {
  const response = await axios.post(baseUrl, payload, {
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return response.data;
}

export async function sendTextMessage(to, body) {
  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body }
  });
}

export async function sendLocationMessage(to, latitude, longitude, name, address) {
  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'location',
    location: {
      latitude,
      longitude,
      name,
      address
    }
  });
}

export async function sendOtpToEmergencyContact(emergencyPhone, code, userPhone) {
  const message = [
    '🔐 Verificación C.R.A.S.H.',
    `El usuario ${userPhone} te registró como contacto de emergencia.`,
    `Código OTP: ${code}`,
    'Comparte este código únicamente con el usuario para confirmar su número.',
    'Si no reconoces esta solicitud, ignora este mensaje.'
  ].join('\n');

  return sendTextMessage(emergencyPhone, message);
}
