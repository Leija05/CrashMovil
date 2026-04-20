# WhatsApp Business Bot (Node.js + Express)

Servicio listo para producción base que implementa:

- Registro de usuario con contacto de emergencia
- OTP seguro con expiración y reintentos
- Verificación de número principal
- Webhook oficial de WhatsApp Cloud API
- Envío automatizado de reporte + ubicación
- Logs de eventos en MongoDB
- Rate limiting + Helmet + colas (BullMQ, opcional con Redis)

## 1) Configuración

```bash
cd whatsapp-bot-node
cp .env.example .env
npm install
npm run dev
```

## 2) Variables .env

Usa las variables solicitadas:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WEBHOOK_VERIFY_TOKEN`

También incluidas:

- `MONGO_URL`
- `DB_NAME`
- `REDIS_URL` (opcional)
- `OTP_TTL_MINUTES`
- `OTP_MAX_ATTEMPTS`

## 3) Endpoints principales

Base URL: `http://localhost:3000/api`

### Registrar usuario y enviar OTP

`POST /users/register`

```json
{
  "userPhone": "+5215512345678",
  "emergencyPhone": "+5215587654321"
}
```

### Validar OTP

`POST /users/verify-otp`

```json
{
  "userPhone": "+5215512345678",
  "otp": "123456"
}
```

### Enviar reporte automático

`POST /reports/send`

```json
{
  "userPhone": "+5215512345678",
  "report": "Impacto frontal severo detectado por acelerómetro.",
  "diagnosis": "Posible trauma torácico. Requiere evaluación inmediata.",
  "latitude": 19.4326077,
  "longitude": -99.133208
}
```

## 4) Flujo completo de verificación

1. Registro del usuario y su contacto de emergencia.
2. El sistema genera OTP y lo envía por WhatsApp al contacto.
3. El usuario captura OTP en app/backend.
4. El backend valida hash + expiración + reintentos.
5. Si es correcto: `verified=true` y habilita envío de reportes.

## 5) Payloads reales para WhatsApp Cloud API

### OTP (texto)

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+5215587654321",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Código de verificación C.R.A.S.H.: 123456"
  }
}
```

### Ubicación (location)

Ver archivo: `examples/whatsapp-location-payload.json`.

## 6) Webhook (Meta)

- Verificación: `GET /api/webhook`
- Recepción: `POST /api/webhook`

## 7) Pasos en Meta (WhatsApp Business Platform)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com/).
2. Agrega producto **WhatsApp**.
3. Obtén:
   - Access Token temporal/permanente
   - Phone Number ID
4. Configura Webhook:
   - Callback URL: `https://TU_DOMINIO/api/webhook`
   - Verify token: `WEBHOOK_VERIFY_TOKEN`
   - Suscribe eventos `messages` y `message_status`.
5. Agrega números de prueba o solicita producción con revisión de negocio.
6. (Producción) usa token de sistema de larga duración + rotación + vault.

## 8) Seguridad y producción

- No guardar OTP en texto plano (se guarda hash HMAC-SHA256)
- TTL con índice de expiración en Mongo
- Intentos máximos configurables
- Rate limiting global
- Helmet/CORS
- Logs en colección `eventlogs`
- Cola BullMQ para desacoplar envío (si Redis está configurado)

## 9) Curl de prueba rápida

```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"userPhone":"+5215512345678","emergencyPhone":"+5215587654321"}'

curl -X POST http://localhost:3000/api/users/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"userPhone":"+5215512345678","otp":"123456"}'

curl -X POST http://localhost:3000/api/reports/send \
  -H "Content-Type: application/json" \
  -d '{"userPhone":"+5215512345678","report":"Impacto detectado","diagnosis":"Evaluar trauma cervical","latitude":19.4326,"longitude":-99.1332}'
```
