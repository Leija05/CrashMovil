# CrashMovil — Resumen del Sistema

## 1) Puntos más importantes

- Sistema automático que detecta choques y envía alertas sin intervención del usuario.
- Uso de IA para generar un diagnóstico médico resumido.
- Envío de alertas por:
  - 📞 Llamada automática con voz IA
  - 💬 Mensajes por WhatsApp/SMS
- Sistema de usuarios con autenticación y token JWT.
- Base de datos central con filtrado por usuario (`owner_id`).
- Arquitectura híbrida con backend dominante (la lógica vive en servidor).
- Uso de permisos previos (*opt-in*) para contactos de emergencia.
- Integración con APIs externas para mensajería, llamadas e IA.

---

## 2) Organización por categorías

### 🚨 Sistema de Emergencia

- Detecta impacto automáticamente.
- Genera diagnóstico con IA.
- Envía alertas por llamada y mensajería.
- Incluye en la alerta:
  - Diagnóstico
  - Ubicación
  - Estado

### 🔐 Autenticación y Usuarios

- Registro/login con:
  - Email/password
  - Google / Apple ID
- Uso de JWT:
  1. Usuario inicia sesión.
  2. Recibe token.
  3. Token se guarda en el celular.
  4. Token identifica al usuario en cada evento.

### 🗄️ Base de Datos

- Base de datos central en MongoDB.
- Cada documento incluye `owner_id` (ID del usuario).
- Datos almacenados:
  - Impactos
  - Contactos
  - Perfil médico
- Consultas filtradas por usuario:

```js
db.impacts.find({ owner_id: current_user_id })
```

### ⚙️ Arquitectura del Sistema

- Modelo híbrido con backend dominante.
- El servidor:
  - Procesa datos
  - Ejecuta acciones
  - No depende de que la app esté abierta

### 📲 Comunicación (Mensajes y Llamadas)

- WhatsApp/SMS vía APIs externas.
- Llamadas automáticas con voz generada por IA.
- Contenido de la notificación:
  - Alerta de emergencia
  - Diagnóstico IA
  - Ubicación GPS

### 🤖 Bot de WhatsApp (Opt-in)

Los contactos deben aceptar recibir mensajes.

Flujo:
1. Usuario agrega contacto.
2. Contacto recibe invitación.
3. Contacto responde “ACEPTO”.
4. Contacto queda marcado como `verified: true`.
5. Solo contactos verificados reciben alertas.

---

## 3) Flujos clave del sistema

### 🧩 Flujo 1: Login

1. Usuario inicia sesión.
2. Servidor genera JWT.
3. Celular guarda token.

### 🚨 Flujo 2: Emergencia (Choque)

1. Sensor detecta impacto.
2. Envía datos al backend.
3. Backend analiza con IA y genera diagnóstico.
4. Backend ejecuta:
   - Envío de WhatsApp/SMS.
   - Llamada automática.
5. Usa token para identificar usuario.
6. Obtiene contactos de emergencia.
7. Envía alertas.

### 💬 Flujo 3: WhatsApp con autorización

1. Usuario registra contacto.
2. Sistema envía invitación.
3. Contacto responde “ACEPTO”.
4. Se guarda como verificado (`verified: true`).
5. En emergencia, solo verificados reciben mensaje.

### 🗄️ Flujo 4: Manejo de datos

1. Usuario guarda datos (impactos/contactos).
2. Backend agrega `owner_id`.
3. Al iniciar sesión, se valida token.
4. Se filtran datos por usuario.
5. App muestra solo información propia.

---

## 4) Tecnologías y función

| Tecnología | Función |
|---|---|
| FastAPI | Backend (API, lógica, procesamiento) |
| MongoDB | Base de datos principal |
| JWT (JSON Web Token) | Autenticación de usuarios |
| OAuth2 | Sistema de login seguro |
| Twilio | Envío de SMS, WhatsApp y llamadas |
| WhatsApp Cloud API (Meta) | Mensajes sin depender de Twilio |
| Gemini (IA) | Generar diagnóstico automático |
| Google TTS | Convertir texto a voz para llamadas |
| Webhook | Recibir respuestas como “ACEPTO” |

---

## 5) Explicación simplificada

Este sistema funciona así:

1. Un casco o sensor detecta un choque.
2. Manda los datos al servidor.
3. El servidor usa IA para entender qué pasó.
4. Luego, automáticamente:
   - Envía mensajes a contactos.
   - Realiza una llamada con voz artificial.

Todo esto ocurre sin que el usuario intervenga.

Además:

- Cada usuario tiene su cuenta, sus contactos y su historial.
- El sistema identifica al usuario con su token.
- Los contactos de emergencia deben aceptar (*opt-in*) para poder recibir alertas.
- La base de datos es central, pero separa información por usuario para que cada quien vea solo lo suyo.
