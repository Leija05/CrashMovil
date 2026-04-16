import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

const HARDWARE_NAME_PATTERNS = [
  /hc-?0[56]/i,
  /linvor/i,
  /bt[_-]?module/i,
  /casco/i,
  /crash/i,
  /arduino/i,
  /gyro/i,
];

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
} catch {
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

const normalizeName = (value?: string | null) => (value || '').trim().toLowerCase();

const matchesHardwareName = (deviceName: string, preferredNames: string[] = []) => {
  const normalizedDeviceName = normalizeName(deviceName);
  if (!normalizedDeviceName) return false;

  const normalizedPreferred = preferredNames
    .map((name) => normalizeName(name))
    .filter(Boolean);

  if (normalizedPreferred.some((target) => normalizedDeviceName === target)) return true;
  if (normalizedPreferred.some((target) => normalizedDeviceName.includes(target) || target.includes(normalizedDeviceName))) {
    return true;
  }

  return HARDWARE_NAME_PATTERNS.some((pattern) => pattern.test(deviceName));
};

const parseTelemetry = (payload: string): TelemetryData | null => {
  const cleanedPayload = payload.trim();
  if (!cleanedPayload) return null;

  try {
    const parsed = JSON.parse(cleanedPayload);
    const ax = Number(parsed.acceleration_x ?? parsed.ax ?? parsed.accel_x ?? parsed.acx ?? 0);
    const ay = Number(parsed.acceleration_y ?? parsed.ay ?? parsed.accel_y ?? parsed.acy ?? 0);
    const az = Number(parsed.acceleration_z ?? parsed.az ?? parsed.accel_z ?? parsed.acz ?? 0);
    const gx = Number(parsed.gyro_x ?? parsed.gx ?? parsed.roll ?? 0);
    const gy = Number(parsed.gyro_y ?? parsed.gy ?? parsed.pitch ?? 0);
    const gz = Number(parsed.gyro_z ?? parsed.gz ?? parsed.yaw ?? 0);
    const calculatedG = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2);

    return {
      acceleration_x: ax,
      acceleration_y: ay,
      acceleration_z: az,
      gyro_x: gx,
      gyro_y: gy,
      gyro_z: gz,
      g_force: Number(parsed.g_force ?? parsed.g ?? parsed.gforce ?? calculatedG ?? 0),
    };
  } catch {
    // ignore and fallback to CSV parsing
  }

  const parts = cleanedPayload
    .split(/[,\s;|]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => !Number.isNaN(value));

  if (parts.length >= 7) {
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

  if (parts.length === 6) {
    const [ax, ay, az, gx, gy, gz] = parts;
    return {
      acceleration_x: ax,
      acceleration_y: ay,
      acceleration_z: az,
      gyro_x: gx,
      gyro_y: gy,
      gyro_z: gz,
      g_force: Math.sqrt(ax ** 2 + ay ** 2 + az ** 2),
    };
  }

  if (parts.length === 3) {
    const [gx, gy, gz] = parts;
    return {
      acceleration_x: 0,
      acceleration_y: 0,
      acceleration_z: 0,
      gyro_x: gx,
      gyro_y: gy,
      gyro_z: gz,
      g_force: 0,
    };
  }

  if (parts.length < 3) {
    return null;
  }
  return null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  async findHardwareCandidates(preferredNames: string[] = []): Promise<ScanDevice[]> {
    await BluetoothClassic.requestBluetoothEnabled();
    const bondedDevices = await this.getBondedDevices().catch(() => []);
    return bondedDevices.filter((device) => matchesHardwareName(device.name, preferredNames));
  }

  async startScan(onDeviceFound: (device: ScanDevice) => void): Promise<void> {
    const devices = await this.findDevices();
    devices.forEach((device) => onDeviceFound(device));
  }

  private async disconnectCurrentConnection(): Promise<void> {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }

    if (!this.connectedDeviceId) return;

    const previousId = this.connectedDeviceId;
    this.connectedDeviceId = null;
    await BluetoothClassic.disconnectFromDevice(previousId).catch(() => undefined);
    await sleep(250);
  }

  async connect(deviceId: string, onTelemetry: (telemetry: TelemetryData) => void): Promise<ScanDevice> {
    await this.disconnectCurrentConnection();
    await BluetoothClassic.requestBluetoothEnabled();
    if (BluetoothClassic.cancelDiscovery) {
      await BluetoothClassic.cancelDiscovery().catch(() => undefined);
    }
    await sleep(300);

    const connectionAttempts = [
      { delimiter: '\n', deviceCharset: 'utf-8', connectorType: 'rfcomm', secure: false },
      { delimiter: '\n', deviceCharset: 'utf-8', connectorType: 'rfcomm', secure: true },
      { delimiter: '\n', deviceCharset: 'utf-8', secure: false },
    ];

    let lastError: unknown;
    let device: any = null;

    for (const options of connectionAttempts) {
      try {
        device = await BluetoothClassic.connectToDevice(deviceId, options);
        break;
      } catch (error) {
        lastError = error;
        await sleep(400);
      }
    }

    if (!device) {
      const reason = lastError instanceof Error ? lastError.message : 'unknown';
      throw new Error(
        `No se pudo establecer la conexión Bluetooth (SPP). Verifica emparejamiento, PIN y que ningún otro dispositivo esté conectado. Detalle: ${reason}`
      );
    }

    this.connectedDeviceId = device?.id ?? deviceId;

    await sleep(500);

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

  async connectToFirstHardwareMatch(
    preferredNames: string[],
    onTelemetry: (telemetry: TelemetryData) => void
  ): Promise<ScanDevice> {
    const candidates = await this.findHardwareCandidates(preferredNames);
    if (candidates.length === 0) {
      throw new Error(
        'No hay dispositivos Bluetooth emparejados que coincidan con el módulo del hardware. Empareja primero el HC-05 en los ajustes del teléfono.'
      );
    }

    let lastError: unknown;
    for (const device of candidates) {
      try {
        return await this.connect(device.id, onTelemetry);
      } catch (error) {
        lastError = error;
      }
    }

    const reason = lastError instanceof Error ? lastError.message : 'unknown';
    throw new Error(`Se encontraron módulos compatibles, pero no se pudo conectar a ninguno. Detalle: ${reason}`);
  }

  disconnect() {
    this.disconnectCurrentConnection().catch(() => undefined);
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
export const bluetoothDeviceNameMatcher = matchesHardwareName;
