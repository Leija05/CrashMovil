import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

export type BluetoothDetectionStatus =
  | 'idle'
  | 'unavailable'
  | 'searching'
  | 'not_found'
  | 'connected';

const DEFAULT_MODULE_NAMES = ['HC-05', 'HC05', 'HC-10', 'HC10'];

let bluetoothClassicAvailable = false;
let BluetoothClassic: any;

try {
  const module = require('react-native-bluetooth-classic');
  BluetoothClassic = module?.default ?? module;
  bluetoothClassicAvailable = true;
} catch (error) {
  console.error('Bluetooth Classic no está disponible:', error);
  bluetoothClassicAvailable = false;
}

export const isBluetoothClassicAvailable = () => bluetoothClassicAvailable;

const normalizeName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const bluetoothDeviceNameMatcher = (deviceName?: string, preferredNames: string[] = []) => {
  if (!deviceName) return false;
  const normalizedDevice = normalizeName(deviceName);
  const candidates = [...preferredNames, ...DEFAULT_MODULE_NAMES]
    .filter(Boolean)
    .map((name) => normalizeName(name));

  return candidates.some((candidate) =>
    normalizedDevice.includes(candidate) || candidate.includes(normalizedDevice)
  );
};

const normalizeDevice = (device: any): ScanDevice | null => {
  if (!device?.id) return null;
  return {
    id: String(device.id),
    name: String(device.name || '').trim() || `BT-${String(device.id).slice(-4)}`,
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
  private activeDevice: ScanDevice | null = null;

  async requestPermissions() {
    if (Platform.OS !== 'android') return;

    const version = parseInt(String(Platform.Version), 10);
    if (version >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return;
    }

    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  async findHardwareCandidates(preferredNames: string[] = []): Promise<ScanDevice[]> {
    if (!bluetoothClassicAvailable) return [];

    await this.requestPermissions();
    const bonded = await BluetoothClassic.getBondedDevices();

    return bonded
      .map((device: any) => normalizeDevice(device))
      .filter((device: ScanDevice | null): device is ScanDevice => {
        if (!device) return false;
        return bluetoothDeviceNameMatcher(device.name, preferredNames);
      });
  }

  async startPassiveTelemetryListener(
    preferredNames: string[],
    onDeviceDetected: (device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void
  ) {
    this.stopPassiveTelemetryListener();

    if (!bluetoothClassicAvailable) {
      onDeviceDetected(null);
      return;
    }

    await this.requestPermissions();
    const candidates = await this.findHardwareCandidates(preferredNames);
    const matchedDevice = candidates[0] ?? null;
    onDeviceDetected(matchedDevice);

    this.removeDataListener = BluetoothClassic.onDataReceived((event: any) => {
      const telemetry = parseTelemetry(event?.data || '');
      if (telemetry) onTelemetry(telemetry);
    });
  }

  async startModuleTelemetry(
    preferredNames: string[],
    onStatus: (status: BluetoothDetectionStatus, device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void
  ) {
    this.stopPassiveTelemetryListener();
    onStatus('searching', null);

    if (!bluetoothClassicAvailable) {
      onStatus('unavailable', null);
      return;
    }

    await this.requestPermissions();
    const candidates = await this.findHardwareCandidates(preferredNames);
    const selectedDevice = candidates[0] ?? null;

    if (!selectedDevice) {
      onStatus('not_found', null);
      return;
    }

    let connectedInstance: any = null;

    try {
      if (typeof BluetoothClassic.connectToDevice === 'function') {
        connectedInstance = await BluetoothClassic.connectToDevice(selectedDevice.id, {
          delimiter: '\n',
          deviceDelimiter: '\n',
          charset: 'utf-8',
        });
      }
    } catch (error) {
      console.warn('No se pudo conectar de forma activa, se usará escucha pasiva:', error);
    }

    const listenerTarget = connectedInstance && typeof connectedInstance.onDataReceived === 'function'
      ? connectedInstance
      : BluetoothClassic;

    this.activeDevice = selectedDevice;
    onStatus('connected', selectedDevice);

    this.removeDataListener = listenerTarget.onDataReceived((event: any) => {
      const telemetry = parseTelemetry(event?.data || '');
      if (telemetry) onTelemetry(telemetry);
    });
  }

  stopPassiveTelemetryListener() {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }
    this.activeDevice = null;
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
