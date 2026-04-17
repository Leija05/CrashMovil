import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

// Variables de estado del módulo
let bluetoothClassicAvailable = false;
let BluetoothClassic: any;

try {
  // Importación estática para asegurar que Metro Bundler incluya la librería en el build nativo
  const module = require('react-native-bluetooth-classic');
  BluetoothClassic = module?.default ?? module;
  bluetoothClassicAvailable = true;
} catch (error) {
  console.error('Bluetooth Classic no está disponible:', error);
  bluetoothClassicAvailable = false;
}

// Exportación requerida por settings.tsx para verificar disponibilidad
export const isBluetoothClassicAvailable = () => bluetoothClassicAvailable;

const normalizeDevice = (device: any): ScanDevice | null => {
  if (!device?.id) return null;
  return {
    id: String(device.id),
    name: (device.name || `HC05-${String(device.id).slice(-4)}`).trim(),
  };
};

const parseTelemetry = (payload: string): TelemetryData | null => {
  const cleanedPayload = payload.trim();
  if (!cleanedPayload) return null;

  try {
    const parsed = JSON.parse(cleanedPayload);
    return {
      acceleration_x: Number(parsed.acceleration_x ?? parsed.ax ?? 0),
      acceleration_y: Number(parsed.acceleration_y ?? parsed.ay ?? 0),
      acceleration_z: Number(parsed.acceleration_z ?? parsed.az ?? 0),
      gyro_x: Number(parsed.gyro_x ?? parsed.gx ?? 0),
      gyro_y: Number(parsed.gyro_y ?? parsed.gy ?? 0),
      gyro_z: Number(parsed.gyro_z ?? parsed.gz ?? 0),
      g_force: Number(parsed.g_force ?? parsed.g ?? parsed.gforce ?? 0),
    };
  } catch {
    const parts = cleanedPayload.split(',').map((value) => Number(value.trim()));
    if (parts.length < 7 || parts.some((value) => Number.isNaN(value))) return null;
    return {
      acceleration_x: parts[0],
      acceleration_y: parts[1],
      acceleration_z: parts[2],
      gyro_x: parts[3],
      gyro_y: parts[4],
      gyro_z: parts[5],
      g_force: parts[6],
    };
  }
};

class BluetoothTelemetryService {
  private removeDataListener: (() => void) | null = null;
  private connectedDeviceId: string | null = null;

  async requestPermissions() {
    if (Platform.OS === 'android') {
      const version = parseInt(String(Platform.Version), 10);
      if (version >= 31) {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
      } else {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      }
    }
  }

  // RENOMBRADO: De findDevices a findHardwareCandidates para coincidir con tu settings.tsx
  async findHardwareCandidates(): Promise<ScanDevice[]> {
    if (!bluetoothClassicAvailable) return [];
    
    await this.requestPermissions();
    await BluetoothClassic.requestBluetoothEnabled();
    
    // Obtenemos dispositivos vinculados (igual que Serial Bluetooth Terminal)
    const bonded = await BluetoothClassic.getBondedDevices();
    return bonded
      .map((d: any) => normalizeDevice(d))
      .filter((d: any): d is ScanDevice => d !== null);
  }

  // Alias por si acaso otras partes del código usan findDevices
  async findDevices(): Promise<ScanDevice[]> {
    return this.findHardwareCandidates();
  }

  async connect(deviceId: string, onTelemetry: (telemetry: TelemetryData) => void): Promise<ScanDevice> {
    this.disconnect();

    if (!bluetoothClassicAvailable) {
      throw new Error('Bluetooth no disponible');
    }

    // Cancelar cualquier descubrimiento activo para evitar colisiones de socket
    try {
      await BluetoothClassic.cancelDiscovery();
    } catch (e) { }

    // Pausa de estabilización necesaria para el stack de Android
    await new Promise(resolve => setTimeout(resolve, 800));

    // Conexión SPP Insegura (idéntica a Serial Bluetooth Terminal para HC-05)
    const device = await BluetoothClassic.connectToDevice(deviceId, {
      connectorType: 'rfcomm',
      secure: false, 
      connectionType: 'binary',
      delimiter: '\n',
      deviceCharset: 'utf-8',
    });

    const finalId = device?.id ? String(device.id) : deviceId;
    this.connectedDeviceId = finalId;

    this.removeDataListener = BluetoothClassic.onDataReceived((event: any) => {
      const telemetry = parseTelemetry(event?.data || '');
      if (telemetry) onTelemetry(telemetry);
    });

    return {
      id: finalId,
      name: (device?.name || `HC05-${finalId.slice(-4)}`).trim(),
    };
  }

  disconnect() {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }
    if (this.connectedDeviceId) {
      BluetoothClassic.disconnectFromDevice(this.connectedDeviceId).catch(() => {});
      this.connectedDeviceId = null;
    }
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();



