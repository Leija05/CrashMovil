const axios = require('axios');
const env = require('../config/env');

const api = axios.create({
  baseURL: `https://graph.facebook.com/${env.whatsappApiVersion}`,
  headers: {
    Authorization: `Bearer ${env.whatsappAccessToken}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

async function sendTextMessage(to, body) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  };
  const { data } = await api.post(`/${env.whatsappPhoneNumberId}/messages`, payload);
  return { data, payload };
}

async function sendLocationMessage(to, latitude, longitude, name = 'Ubicación', address = 'Ubicación de emergencia') {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'location',
    location: {
      latitude,
      longitude,
      name,
      address,
    },
  };

  const { data } = await api.post(`/${env.whatsappPhoneNumberId}/messages`, payload);
  return { data, payload };
}

module.exports = {
  sendTextMessage,
  sendLocationMessage,
};
