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
  const cleaned = payload.trim();
  if (!cleaned) return null;

  // Intento 1: ¿Es JSON? ({"g": 1.05, ...})
  try {
    const parsed = JSON.parse(cleaned);
    return {
      acceleration_x: Number(parsed.ax || parsed.acceleration_x || 0),
      acceleration_y: Number(parsed.ay || parsed.acceleration_y || 0),
      acceleration_z: Number(parsed.az || parsed.acceleration_z || 0),
      gyro_x: Number(parsed.gx || parsed.gyro_x || 0),
      gyro_y: Number(parsed.gy || parsed.gyro_y || 0),
      gyro_z: Number(parsed.gz || parsed.gyro_z || 0),
      g_force: Number(parsed.g || parsed.g_force || 1.0),
    };
  } catch {
    // Intento 2: ¿Es CSV? (ax,ay,az,gx,gy,gz,g)
    const parts = cleaned.split(',').map(v => Number(v.trim()));
    if (parts.length >= 7) {
      return {
        acceleration_x: parts[0],
        acceleration_y: parts[1],
        acceleration_z: parts[2],
        gyro_x: parts[3],
        gyro_y: parts[4],
        gyro_z: parts[5],
        g_force: parts[6]
      };
    }
  }
  return null;
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
        (err, char) => {
    if (err) {
      console.log("❌ Error en monitor BLE:", err.message);
      return;
    }
    if (char?.value) {
      const rawString = decodeBase64(char.value);
      console.log("📥 Raw Data recibida:", rawString); // ESTO ES CLAVE

      const data = parseTelemetry(rawString);
      if (data) {
        onTelemetry(data);
      } else {
        console.log("⚠️ Falló el parseo de:", rawString);
      }
    }
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
