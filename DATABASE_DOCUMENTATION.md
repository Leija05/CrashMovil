# C.R.A.S.H. Database Documentation

## Base de Datos: MongoDB (NoSQL)

La aplicación usa **MongoDB**, una base de datos NoSQL que almacena documentos JSON.
**NO usa SQL** - usa colecciones y documentos.

---

## Colecciones (Tablas en MongoDB)

### 1. `emergency_contacts` - Contactos de Emergencia
```json
{
  "id": "uuid-string",
  "name": "Juan Pérez",
  "phone": "+52 555 123 4567",
  "relationship": "family",  // family, friend, spouse, parent, sibling, other
  "is_primary": true,
  "created_at": "2026-03-24T00:00:00.000Z"
}
```

### 2. `impact_events` - Eventos de Impacto
```json
{
  "id": "uuid-string",
  "timestamp": "2026-03-24T00:00:00.000Z",
  "g_force": 12.5,
  "acceleration_x": 8.2,
  "acceleration_y": -5.1,
  "acceleration_z": 7.3,
  "gyro_x": 45.2,
  "gyro_y": -30.1,
  "gyro_z": 15.5,
  "severity": "high",  // low, medium, high, critical
  "latitude": 19.4326,
  "longitude": -99.1332,
  "was_false_alarm": false,
  "ai_diagnosis": null
}
```

### 3. `device_settings` - Configuración del Dispositivo
```json
{
  "id": "uuid-string",
  "device_name": "CASCO_V2.0",
  "impact_threshold": 5.0,
  "countdown_seconds": 30,
  "auto_call_enabled": true,
  "sms_enabled": true,
  "message_type": "sms",  // "sms" or "whatsapp"
  "language": "es",  // "es" or "en"
  "theme": "dark",  // "dark" or "light"
  "updated_at": "2026-03-24T00:00:00.000Z"
}
```

### 4. `user_profile` - Perfil del Usuario
```json
{
  "id": "uuid-string",
  "name": "María García",
  "blood_type": "O+",
  "allergies": "Penicilina, mariscos",
  "medical_conditions": "Diabetes tipo 2",
  "emergency_notes": "Usa insulina diariamente",
  "created_at": "2026-03-24T00:00:00.000Z"
}
```

---

## Configuración de MongoDB

### Conexión Local
```bash
# En backend/.env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="crash_database"
```

### Usando MongoDB Atlas (Cloud)
```bash
# En backend/.env
MONGO_URL="mongodb+srv://usuario:password@cluster.mongodb.net"
DB_NAME="crash_database"
```

---

## Iniciar MongoDB Localmente

### Opción 1: Instalar MongoDB
```bash
# Ubuntu/Debian
sudo apt install mongodb

# macOS con Homebrew
brew install mongodb-community

# Iniciar servicio
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # macOS
```

### Opción 2: Usar Docker
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

---

## Comandos MongoDB Shell

```javascript
// Conectar
mongosh "mongodb://localhost:27017"

// Usar la base de datos
use crash_database

// Ver colecciones
show collections

// Crear índices (opcional pero recomendado)
db.emergency_contacts.createIndex({ "id": 1 })
db.impact_events.createIndex({ "timestamp": -1 })
db.impact_events.createIndex({ "severity": 1 })

// Insertar contacto de ejemplo
db.emergency_contacts.insertOne({
  id: "contact-001",
  name: "Juan Pérez",
  phone: "+52 555 123 4567",
  relationship: "family",
  is_primary: true,
  created_at: new Date()
})

// Ver todos los contactos
db.emergency_contacts.find().pretty()

// Insertar configuración inicial
db.device_settings.insertOne({
  id: "settings-001",
  device_name: "CASCO_V2.0",
  impact_threshold: 5.0,
  countdown_seconds: 30,
  auto_call_enabled: true,
  sms_enabled: true,
  message_type: "sms",
  language: "es",
  theme: "dark",
  updated_at: new Date()
})
```

---

## Clasificación de Severidad del Impacto

| G-Force | Severidad |
|---------|-----------|
| < 5 G   | low       |
| 5-10 G  | medium    |
| 10-15 G | high      |
| > 15 G  | critical  |

---

## Nota Importante

MongoDB **NO requiere crear tablas/colecciones previamente**. 
Las colecciones se crean automáticamente cuando se inserta el primer documento.

La API del backend crea automáticamente los documentos necesarios cuando:
1. Se guarda el primer contacto
2. Se detecta el primer impacto
3. Se accede a la configuración por primera vez

---

## Variables de Entorno Necesarias

```env
# backend/.env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="crash_database"
EMERGENT_LLM_KEY=tu_clave_para_gemini_ai
```
