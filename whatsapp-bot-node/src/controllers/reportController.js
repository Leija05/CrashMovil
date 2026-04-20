const User = require('../models/User');
const EventLog = require('../models/EventLog');
const { normalizePhone } = require('../utils/phone');
const { enqueueText, enqueueLocation } = require('../services/queueService');

async function sendAutomatedReport(req, res) {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const report = String(req.body.report || '').trim();
    const diagnosis = String(req.body.diagnosis || '').trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    if (!report || !diagnosis || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({ error: 'report, diagnosis, latitude, longitude are required' });
    }

    const user = await User.findOne({ userPhone });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.verified) return res.status(403).json({ error: 'User phone not verified yet' });

    const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    const message = [
      '🚨 *Alerta C.R.A.S.H.*',
      '',
      `📄 *Reporte:* ${report}`,
      `🩺 *Diagnóstico:* ${diagnosis}`,
      `📍 *Coordenadas:* ${latitude}, ${longitude}`,
      `🗺️ *Ubicación:* ${mapsUrl}`,
    ].join('\n');

    await enqueueText(userPhone, message);
    await enqueueLocation(userPhone, latitude, longitude, 'Ubicación de emergencia', 'Evento detectado por C.R.A.S.H.');

    await EventLog.create({
      type: 'report_sent',
      userPhone,
      payload: { report, diagnosis, latitude, longitude, mapsUrl },
    });

    return res.json({
      message: 'Reporte enviado por WhatsApp',
      payloadPreview: message,
      mapsUrl,
    });
  } catch (error) {
    await EventLog.create({ type: 'report_sent', status: 'error', error: error.message, payload: req.body });
    return res.status(500).json({ error: 'Failed to send report', detail: error.message });
  }
}

module.exports = { sendAutomatedReport };
