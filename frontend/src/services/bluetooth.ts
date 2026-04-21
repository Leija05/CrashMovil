import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

const DEFAULT_MODULE_NAMES = ['HM-10', 'HM10', 'HC-05', 'HC05'];
const DEFAULT_SERVICE_UUIDS = ['FFE0', '180F'];
const DEFAULT_CHARACTERISTIC_UUIDS = ['FFE1', '2A19'];

let bleAvailable = false;
let manager: BleManager | null = null;

try {
  manager = new BleManager();
  bleAvailable = true;
} catch (error) {
  console.error('Bluetooth LE no está disponible:', error);
  bleAvailable = false;
}

export const isBluetoothLeAvailable = () => bleAvailable;

const normalizeName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const decodeBase64 = (value: string) => {
  if (!value) return '';
  if (typeof globalThis.atob === 'function') return globalThis.atob(value);
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

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

const normalizeDevice = (device: Device): ScanDevice | null => {
  if (!device?.id) return null;
  return {
    id: String(device.id),
    name: String(device.name || device.localName || '').trim() || `BLE-${String(device.id).slice(-4)}`,
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

const createTelemetryStreamParser = (onTelemetry: (telemetry: TelemetryData) => void) => {
  let pending = '';
  return (chunk: string) => {
    if (!chunk) return;
    pending = `${pending}${chunk}`.replace(/\r/g, '');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const telemetry = parseTelemetry(line);
      if (telemetry) onTelemetry(telemetry);
    }
  };
};

class BluetoothTelemetryService {
  private monitorSubscription: Subscription | null = null;
  private connectedDevice: Device | null = null;

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
    if (!bleAvailable || !manager) return [];

    await this.requestPermissions();

    return new Promise((resolve) => {
      const matches = new Map<string, ScanDevice>();

      manager?.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          manager?.stopDeviceScan();
          resolve([]);
          return;
        }

        if (!device) return;
        const normalized = normalizeDevice(device);
        if (!normalized) return;

        if (bluetoothDeviceNameMatcher(normalized.name, preferredNames)) {
          matches.set(normalized.id, normalized);
        }
      });

      setTimeout(() => {
        manager?.stopDeviceScan();
        resolve([...matches.values()]);
      }, 3500);
    });
  }

  async startPassiveTelemetryListener(
    preferredNames: string[],
    onDeviceDetected: (device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void
  ) {
    this.stopPassiveTelemetryListener();

    if (!bleAvailable || !manager) {
      onDeviceDetected(null);
      return;
    }

    await this.requestPermissions();
    const candidates = await this.findHardwareCandidates(preferredNames);
    const matchedDevice = candidates[0] ?? null;
    onDeviceDetected(matchedDevice);

    if (!matchedDevice) return;

    try {
      this.connectedDevice = await manager.connectToDevice(matchedDevice.id, { timeout: 10000 });
      await this.connectedDevice.discoverAllServicesAndCharacteristics();
      const streamParser = createTelemetryStreamParser(onTelemetry);

      const services = await this.connectedDevice.services();
      const service = services.find((s) => DEFAULT_SERVICE_UUIDS.includes(s.uuid.slice(-4).toUpperCase()));
      if (!service) return;

      const characteristics = await service.characteristics();
      const characteristic = characteristics.find((c) =>
        DEFAULT_CHARACTERISTIC_UUIDS.includes(c.uuid.slice(-4).toUpperCase())
      );

      if (!characteristic) return;

      this.monitorSubscription = this.connectedDevice.monitorCharacteristicForService(
        service.uuid,
        characteristic.uuid,
        (error, updated) => {
          if (error || !updated?.value) return;
          const rawPayload = decodeBase64(updated.value);
          streamParser(rawPayload);
        }
      );
    } catch (error) {
      console.error('BLE listener error:', error);
      onDeviceDetected(null);
    }
  }

  stopPassiveTelemetryListener() {
    if (this.monitorSubscription) {
      this.monitorSubscription.remove();
      this.monitorSubscription = null;
    }

    if (this.connectedDevice) {
      this.connectedDevice.cancelConnection().catch(() => undefined);
    }

    this.connectedDevice = null;
    manager?.stopDeviceScan();
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
