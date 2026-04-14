import { TelemetryData } from '../store/crashStore';

export interface ScanDevice {
  id: string;
  name: string;
}

type BluetoothClassicModule = {
  requestBluetoothEnabled: () => Promise<void>;
  startDiscovery: () => Promise<any[]>;
  connectToDevice: (deviceId: string, options?: Record<string, unknown>) => Promise<any>;
  onDataReceived: (handler: (event: any) => void) => () => void;
  disconnectFromDevice: (deviceId: string) => Promise<void>;
};

const createBluetoothUnavailableError = () =>
  new Error(
    'Bluetooth Classic is unavailable. Install and configure react-native-bluetooth-classic on Android to use this feature.'
  );

const loadBluetoothClassic = (): BluetoothClassicModule => {
  try {
    // Use eval to avoid Metro trying to statically resolve this optional dependency
    // in platforms/builds where it is not installed.
    // eslint-disable-next-line no-eval
    const dynamicRequire = eval('require') as (moduleName: string) => any;
    const module = dynamicRequire('react-native-bluetooth-classic');

    return (module?.default ?? module) as BluetoothClassicModule;
  } catch {
    return {
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
    };
  }
};

const BluetoothClassic = loadBluetoothClassic();

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

  async startScan(onDeviceFound: (device: ScanDevice) => void): Promise<void> {
    await BluetoothClassic.requestBluetoothEnabled();

    const devices = await BluetoothClassic.startDiscovery();
    const list = Array.isArray(devices) ? devices : [];

    list.forEach((device: any) => {
      if (!device?.id) return;
      onDeviceFound({
        id: device.id,
        name: (device.name || `HC05-${String(device.id).slice(-4)}`).trim(),
      });
    });
  }

  async connect(deviceId: string, onTelemetry: (telemetry: TelemetryData) => void): Promise<ScanDevice> {
    this.disconnect();

    const device = await BluetoothClassic.connectToDevice(deviceId, {
      delimiter: '\n',
      deviceCharset: 'utf-8',
    });

    this.connectedDeviceId = device?.id ?? deviceId;

    this.removeDataListener = BluetoothClassic.onDataReceived((event: any) => {
      const message: string = event?.data ?? '';
      const telemetry = parseTelemetry(message);
      if (telemetry) {
        onTelemetry(telemetry);
      }
    });

    return {
      id: this.connectedDeviceId,
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
