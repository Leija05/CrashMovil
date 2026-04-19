# WhatsApp Business Bot (Verificación + Reportes)

Servicio Node.js + Express listo para producción base, con:

- Registro de usuario y contacto de emergencia
- OTP con expiración e intentos
- Verificación por endpoint y por webhook (`ACEPTO 123456`)
- Envío de reporte + diagnóstico + ubicación
- Cola con BullMQ para envío resiliente
- Rate limiting, logging estructurado y helmet

## Estructura

```text
whatsapp-bot/
  src/
    config/
    controllers/
    middleware/
    models/
    queues/
    routes/
    services/
    utils/
    app.js
    server.js
  .env.example
  package.json
```

## Variables de entorno

Copia `.env.example` a `.env` y define:

- `MONGO_URL`, `DB_NAME`
- `REDIS_URL`
- `WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION`

> Nunca subas tokens reales a git. Rota cualquier token que se haya expuesto.

## Instalación

```bash
cd whatsapp-bot
npm install
npm run dev
```

## Endpoints

### 1) Registro + envío de OTP al contacto de emergencia

`POST /api/verification/register`

```json
{
  "userPhone": "5215512345678",
  "emergencyPhone": "5215587654321"
}
```

### 2) Confirmación OTP (ingresado por usuario)

`POST /api/verification/confirm`

```json
{
  "userPhone": "5215512345678",
  "code": "123456"
}
```

### 3) Envío de reporte automatizado

`POST /api/reports/send`

```json
{
  "userPhone": "5215512345678",
  "report": "Impacto detectado a alta velocidad.",
  "diagnosis": "Posible traumatismo cervical. Requiere atención inmediata.",
  "lat": 19.432608,
  "lng": -99.133209
}
```

## Webhook de WhatsApp

### Verificación de webhook (Meta)

`GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`

- Si `hub.verify_token` coincide con `WEBHOOK_VERIFY_TOKEN`, responde `hub.challenge`.

### Recepción de mensajes entrantes

`POST /webhook`

- Si el contacto de emergencia envía `ACEPTO 123456`, el sistema intenta verificar OTP automáticamente.

## Payload real de WhatsApp (texto)

```json
{
  "messaging_product": "whatsapp",
  "to": "5215512345678",
  "type": "text",
  "text": {
    "body": "🚨 Alerta C.R.A.S.H.\n📄 Reporte: ...\n🩺 Diagnóstico: ...\n📍 Coordenadas: 19.432608, -99.133209\n🗺️ Ubicación: https://www.google.com/maps?q=19.432608,-99.133209"
  }
}
```

## Payload real de WhatsApp (ubicación)

```json
{
  "messaging_product": "whatsapp",
  "to": "5215512345678",
  "type": "location",
  "location": {
    "latitude": 19.432608,
    "longitude": -99.133209,
    "name": "Ubicación de emergencia",
    "address": "https://www.google.com/maps?q=19.432608,-99.133209"
  }
}
```

## Configuración en Meta (resumen)

1. Crea app en Meta for Developers y agrega producto WhatsApp.
2. Obtén `Phone Number ID` y `Access Token`.
3. Configura webhook URL: `https://TU_DOMINIO/webhook`.
4. Configura verify token igual a `WEBHOOK_VERIFY_TOKEN`.
5. Suscribe evento `messages`.
6. En modo producción, verifica empresa y número remitente.

## Seguridad y producción

- Usa HTTPS obligatorio para webhook
- Guarda secretos en vault (no `.env` en repositorio)
- Configura rotation de tokens
- Monitorea cola BullMQ y reintentos
- Agrega firma de webhook (`X-Hub-Signature-256`) si habilitas App Secret
