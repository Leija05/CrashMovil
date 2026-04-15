import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

const createBluetoothUnavailableError = () =>
  new Error(
    'Bluetooth Classic is unavailable. Asegúrate de compilar la app nativa y no usar Expo Go.'
  );

let bluetoothClassicAvailable = false;
let BluetoothClassic: any;

try {
  // Al usar require estático, obligamos a Metro Bundler a empaquetar 
  // la librería dentro de la app al compilar.
  const module = require('react-native-bluetooth-classic');
  BluetoothClassic = module?.default ?? module;
  bluetoothClassicAvailable = true;
} catch (error) {
  bluetoothClassicAvailable = false;
  BluetoothClassic = {
    requestBluetoothEnabled: async () => {
      throw createBluetoothUnavailableError();
    },
    startDiscovery: async () => {
      throw createBluetoothUnavailableError();
    },
    connectToDevice: async () => {
      throw createBluetoothUnavailableError();
    },
    onDataReceived: () => () => undefined,
    disconnectFromDevice: async () => undefined,
    getBondedDevices: async () => [],
    cancelDiscovery: async () => undefined,
  };
}

export const isBluetoothClassicAvailable = () => bluetoothClassicAvailable;

const normalizeDevice = (device: any): ScanDevice | null => {
  if (!device?.id) return null;
  return {
    id: String(device.id),
    name: (device.name || `HC05-${String(device.id).slice(-4)}`).trim(),
  };
};

const dedupeDevices = (devices: ScanDevice[]) => {
  const unique = new Map<string, ScanDevice>();
  devices.forEach((device) => {
    if (!unique.has(device.id)) {
      unique.set(device.id, device);
    }
  });
  return Array.from(unique.values());
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
    // ignore and fallback to CSV parsing
  }

  const parts = cleanedPayload.split(',').map((value) => Number(value.trim()));
  if (parts.length < 7 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    acceleration_x: parts[0],
    acceleration_y: parts[1],
    acceleration_z: parts[2],
    gyro_x: parts[3],
    gyro_y: parts[4],
    gyro_z: parts[5],
    g_force: parts[6],
  };
};

class BluetoothTelemetryService {
  private removeDataListener: (() => void) | null = null;
  private connectedDeviceId: string | null = null;

  private async getBondedDevices(): Promise<ScanDevice[]> {
    if (!BluetoothClassic.getBondedDevices) return [];
    const bonded = await BluetoothClassic.getBondedDevices();
    const list = Array.isArray(bonded) ? bonded : [];
    return list
      .map((device: any) => normalizeDevice(device))
      .filter((device: ScanDevice | null): device is ScanDevice => device !== null);
  }

  private async getDiscoveredDevices(timeoutMs = 20000): Promise<ScanDevice[]> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        BluetoothClassic.startDiscovery(),
        new Promise<'timeout'>((resolve) => {
          timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);

      if (result === 'timeout') {
        if (BluetoothClassic.cancelDiscovery) {
          await BluetoothClassic.cancelDiscovery().catch(() => undefined);
        }
        return [];
      }

      const list = Array.isArray(result) ? result : [];
      return list
        .map((device: any) => normalizeDevice(device))
        .filter((device: ScanDevice | null): device is ScanDevice => device !== null);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async findDevices(timeoutMs = 20000): Promise<ScanDevice[]> {
    // 1. Solicitar permisos de Android en tiempo de ejecución
    if (Platform.OS === 'android') {
      const version = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version as string, 10);

      if (version >= 31) { // Android 12 o superior
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        if (
          granted['android.permission.BLUETOOTH_SCAN'] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          throw new Error('Permisos de Bluetooth denegados. Es necesario aceptarlos para buscar el casco.');
        }
      } else { // Android 11 o inferior
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Permiso de ubicación denegado. Es necesario para escanear dispositivos Bluetooth.');
        }
      }
    }

    // 2. Encender Bluetooth y buscar
    await BluetoothClassic.requestBluetoothEnabled();
    const [bondedDevices, discoveredDevices] = await Promise.all([
      this.getBondedDevices().catch(() => []),
      this.getDiscoveredDevices(timeoutMs),
    ]);
    return dedupeDevices([...bondedDevices, ...discoveredDevices]);
  }

  async startScan(onDeviceFound: (device: ScanDevice) => void): Promise<void> {
    const devices = await this.findDevices();
    devices.forEach((device) => onDeviceFound(device));
  }

  async connect(deviceId: string, onTelemetry: (telemetry: TelemetryData) => void): Promise<ScanDevice> {
    this.disconnect();

    const device = await BluetoothClassic.connectToDevice(deviceId, {
      delimiter: '\n',
      deviceCharset: 'utf-8',
      connectorType: 'rfcomm',
      secure: false,
    });

    this.connectedDeviceId = device?.id ?? deviceId;

    await new Promise(resolve => setTimeout(resolve, 500));

    this.removeDataListener = BluetoothClassic.onDataReceived((event: any) => {
      const message: string = event?.data ?? '';
      const telemetry = parseTelemetry(message);
      if (telemetry) {
        onTelemetry(telemetry);
      }
    });

    return {
      id: this.connectedDeviceId as string,
      name: (device?.name || `HC05-${String(this.connectedDeviceId).slice(-4)}`).trim(),
    };
  }

  disconnect() {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }

    if (this.connectedDeviceId) {
      BluetoothClassic.disconnectFromDevice(this.connectedDeviceId).catch(() => undefined);
      this.connectedDeviceId = null;
    }
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();