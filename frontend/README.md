# C.R.A.S.H Frontend (Android APK nativo)

Este frontend está configurado para ejecutarse como app **nativa de Android** (APK), sin usar Expo Go.

## Requisitos

- Node.js 18+
- JDK 17
- Android Studio + SDK de Android

## Instalación

```bash
npm install
```

## Ejecutar en dispositivo/emulador Android (dev client nativo)

```bash
npm run android
```

## Generar APK

### Debug APK

```bash
npm run build:apk:debug
```

Salida esperada:

`android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK

```bash
npm run build:apk:release
```

Salida esperada:

`android/app/build/outputs/apk/release/app-release.apk`

## Bluetooth telemetry (Arduino)

- La pestaña Settings incluye escaneo/conexión por Bluetooth clásico para módulo HC-05/HC-06.
- El módulo debe enviar datos seriales con delimitador de nueva línea (`\n`).
- Formatos aceptados:
  - JSON: `{"ax":0.1,"ay":0.2,"az":1.0,"gx":0.0,"gy":0.0,"gz":0.0,"g":1.02}`
  - CSV: `ax,ay,az,gx,gy,gz,g`

Si Bluetooth sigue fallando, verifica:

1. Permisos `BLUETOOTH_SCAN` y `BLUETOOTH_CONNECT` concedidos.
2. Módulo HC-05 emparejado a nivel de Android antes de abrir la app.
3. Que estés usando el APK nativo (no Expo Go).
