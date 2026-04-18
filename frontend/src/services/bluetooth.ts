import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

let bluetoothClassicAvailable = false;
type RawBluetoothDevice = {
  id?: string | number;
  name?: string | null;
};

type BluetoothDataEvent = {
  data?: string;
};

type BluetoothSubscription = {
  remove?: () => void;
};

type BluetoothClassicModule = {
  getBondedDevices: () => Promise<RawBluetoothDevice[]>;
  connectToDevice: (id: string) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  onDataReceived: (listener: (event: BluetoothDataEvent) => void) => (() => void) | BluetoothSubscription;
  onDeviceDisconnected?: (listener: (event: unknown) => void) => (() => void) | BluetoothSubscription;
};

let BluetoothClassic: BluetoothClassicModule | null = null;

try {
  const module = require('react-native-bluetooth-classic');
  BluetoothClassic = (module?.default ?? module) as BluetoothClassicModule;
  bluetoothClassicAvailable = true;
} catch (error) {
  console.error('Bluetooth Classic no está disponible:', error);
  bluetoothClassicAvailable = false;
}

export const isBluetoothClassicAvailable = () => bluetoothClassicAvailable;

const normalizeName = (value: string) => value.trim().toUpperCase().replace(/[\s_-]+/g, '');

const TARGET_MODULE_NAMES = ['HC05'];

export const bluetoothDeviceNameMatcher = (deviceName?: string, preferredNames: string[] = []) => {
  if (!deviceName) return false;
  const normalizedDevice = normalizeName(deviceName);
  const preferred = preferredNames
    .filter(Boolean)
    .map((name) => normalizeName(name))
    .filter((name) => TARGET_MODULE_NAMES.includes(name));
  const candidates = preferred.length > 0 ? preferred : TARGET_MODULE_NAMES;

  return candidates.some((candidate) => normalizedDevice === candidate || normalizedDevice.includes(candidate));
};

const normalizeDevice = (device: RawBluetoothDevice): ScanDevice | null => {
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
  private removeDisconnectListener: (() => void) | null = null;
  private connectedDeviceId: string | null = null;
  private payloadBuffer = '';

  async requestPermissions(): Promise<void> {
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
    if (!bluetoothClassicAvailable || !BluetoothClassic) return [];

    await this.requestPermissions();
    const bonded = await BluetoothClassic.getBondedDevices();

    return bonded
      .map((device) => normalizeDevice(device))
      .filter((device: ScanDevice | null): device is ScanDevice => {
        if (!device) return false;
        return bluetoothDeviceNameMatcher(device.name, preferredNames);
      });
  }

  private disposeDataListener() {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }
  }

  private disposeDisconnectListener() {
    if (this.removeDisconnectListener) {
      this.removeDisconnectListener();
      this.removeDisconnectListener = null;
    }
  }

  private async disconnectCurrentDevice(): Promise<void> {
    if (!BluetoothClassic) return;
    try {
      if (this.connectedDeviceId && BluetoothClassic.disconnect) {
        await BluetoothClassic.disconnect();
      }
    } catch (error) {
      console.warn('Error al desconectar Bluetooth Classic:', error);
    } finally {
      this.connectedDeviceId = null;
    }
  }

  private createDataListener(onTelemetry: (telemetry: TelemetryData) => void): (() => void) | null {
    if (!BluetoothClassic) return null;

    const subscription = BluetoothClassic.onDataReceived((event: BluetoothDataEvent) => {
      if (typeof event?.data !== 'string') return;
      this.payloadBuffer += event.data;

      const frames = this.payloadBuffer.split(/\r?\n/);
      this.payloadBuffer = frames.pop() ?? '';

      frames.forEach((frame) => {
        const telemetry = parseTelemetry(frame);
        if (telemetry) onTelemetry(telemetry);
      });
    });

    if (typeof subscription === 'function') return subscription;
    if (typeof subscription?.remove === 'function') {
      return () => subscription.remove?.();
    }

    return null;
  }

  private createDisconnectionListener(onDisconnected: () => void): (() => void) | null {
    if (!BluetoothClassic?.onDeviceDisconnected) return null;
    const subscription = BluetoothClassic.onDeviceDisconnected(() => onDisconnected());

    if (typeof subscription === 'function') return subscription;
    if (typeof subscription?.remove === 'function') {
      return () => subscription.remove?.();
    }

    return null;
  }

  async startPassiveTelemetryListener(
    preferredNames: string[],
    onDeviceDetected: (device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void
  ): Promise<void> {
    this.stopPassiveTelemetryListener();

    if (!bluetoothClassicAvailable || !BluetoothClassic) {
      onDeviceDetected(null);
      return;
    }

    await this.requestPermissions();
    const candidates = await this.findHardwareCandidates(preferredNames);
    const matchedDevice = candidates[0] ?? null;
    if (!matchedDevice) {
      onDeviceDetected(null);
      return;
    }

    try {
      await BluetoothClassic.connectToDevice(matchedDevice.id);
      this.connectedDeviceId = matchedDevice.id;
      this.payloadBuffer = '';
      onDeviceDetected(matchedDevice);
      this.removeDataListener = this.createDataListener(onTelemetry);
      this.removeDisconnectListener = this.createDisconnectionListener(() => {
        this.stopPassiveTelemetryListener();
        onDeviceDetected(null);
      });
    } catch (error) {
      console.error(`No se pudo conectar con el dispositivo ${matchedDevice.name}:`, error);
      await this.disconnectCurrentDevice();
      this.disposeDataListener();
      this.disposeDisconnectListener();
      onDeviceDetected(null);
      throw error;
    }
  }

  stopPassiveTelemetryListener(): void {
    this.payloadBuffer = '';
    this.disposeDataListener();
    this.disposeDisconnectListener();
    void this.disconnectCurrentDevice();
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
