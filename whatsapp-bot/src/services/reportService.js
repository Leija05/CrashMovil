import { buildGoogleMapsLink } from '../utils/maps.js';
import { sendLocationMessage, sendTextMessage } from './whatsappClient.js';

export async function sendEmergencyReport({ to, report, diagnosis, lat, lng }) {
  const mapsLink = buildGoogleMapsLink(lat, lng);
  const text = [
    '🚨 Alerta C.R.A.S.H.',
    '',
    '📄 Reporte:',
    report,
    '',
    '🩺 Diagnóstico:',
    diagnosis,
    '',
    `📍 Coordenadas: ${lat}, ${lng}`,
    `🗺️ Ubicación: ${mapsLink}`
  ].join('\n');

  await sendTextMessage(to, text);
  await sendLocationMessage(to, lat, lng, 'Ubicación de emergencia', mapsLink);

  return { delivered: true, mapsLink };
}
