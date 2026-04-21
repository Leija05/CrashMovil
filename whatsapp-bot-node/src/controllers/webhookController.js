const env = require('../config/env');
const EventLog = require('../models/EventLog');

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.webhookVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

async function receiveWebhook(req, res) {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (message) {
      await EventLog.create({
        type: 'incoming_message',
        payload: {
          from: message.from,
          type: message.type,
          text: message.text?.body || '',
          raw: req.body,
        },
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    return res.status(500).json({ error: 'Webhook processing failed', detail: error.message });
  }
}

module.exports = { verifyWebhook, receiveWebhook };
