import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

const DEVICE_ALIASES_STORAGE_KEY = '@crashmovil/bluetooth-device-aliases';

type DeviceAliasMap = Record<string, string>;

export interface ScanDevice {
  id: string;
  name: string;
  alias?: string;
  displayName: string;
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

const normalizeAddress = (address: string) => String(address).trim().toUpperCase();

const normalizeAlias = (alias: string) => alias.trim();

const getDisplayName = (name: string, alias?: string) => alias || name;

const normalizeDevice = (device: any, aliases: DeviceAliasMap = {}): ScanDevice | null => {
  if (!device?.id) return null;

  const id = normalizeAddress(device.id);
  const fallbackName = `HC05-${id.slice(-4)}`;
  const name = (device.name || fallbackName).trim();
  const alias = aliases[id];

  return {
    id,
    name,
    alias,
    displayName: getDisplayName(name, alias),
  };
};

const parseTelemetryPayload = (payload: string): TelemetryData | null => {
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

const parseTelemetryChunk = (chunk: string): TelemetryData[] => {
  return chunk
    .split(/\r?\n/)
    .map((line) => parseTelemetryPayload(line))
    .filter((telemetry): telemetry is TelemetryData => telemetry !== null);
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

  async getDeviceAliases(): Promise<DeviceAliasMap> {
    try {
      const aliasesRaw = await AsyncStorage.getItem(DEVICE_ALIASES_STORAGE_KEY);
      if (!aliasesRaw) return {};

      const parsedAliases = JSON.parse(aliasesRaw);
      if (!parsedAliases || typeof parsedAliases !== 'object') return {};

      return Object.entries(parsedAliases).reduce<DeviceAliasMap>((acc, [mac, alias]) => {
        if (typeof alias !== 'string') return acc;

        const normalizedMac = normalizeAddress(mac);
        const normalizedAlias = normalizeAlias(alias);
        if (!normalizedAlias) return acc;

        acc[normalizedMac] = normalizedAlias;
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  async setDeviceAlias(deviceId: string, alias: string): Promise<DeviceAliasMap> {
    const normalizedId = normalizeAddress(deviceId);
    const normalizedAlias = normalizeAlias(alias);
    const currentAliases = await this.getDeviceAliases();

    if (normalizedAlias) {
      currentAliases[normalizedId] = normalizedAlias;
    } else {
      delete currentAliases[normalizedId];
    }

    await AsyncStorage.setItem(DEVICE_ALIASES_STORAGE_KEY, JSON.stringify(currentAliases));
    return currentAliases;
  }

  async clearDeviceAlias(deviceId: string): Promise<DeviceAliasMap> {
    return this.setDeviceAlias(deviceId, '');
  }

  // Sin descubrimiento activo: solo dispositivos vinculados en el sistema operativo.
  async findHardwareCandidates(): Promise<ScanDevice[]> {
    if (!bluetoothClassicAvailable) return [];

    await this.requestPermissions();
    await BluetoothClassic.requestBluetoothEnabled();

    const aliases = await this.getDeviceAliases();
    const bonded = await BluetoothClassic.getBondedDevices();

    return bonded
      .map((device: any) => normalizeDevice(device, aliases))
      .filter((device: ScanDevice | null): device is ScanDevice => device !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Alias por compatibilidad con flujos existentes.
  async findDevices(): Promise<ScanDevice[]> {
    return this.findHardwareCandidates();
  }

  async connect(deviceId: string, onTelemetry: (telemetry: TelemetryData) => void): Promise<ScanDevice> {
    this.disconnect();

    if (!bluetoothClassicAvailable) {
      throw new Error('Bluetooth no disponible');
    }

    const normalizedId = normalizeAddress(deviceId);

    await this.requestPermissions();
    await BluetoothClassic.requestBluetoothEnabled();

    const device = await BluetoothClassic.connectToDevice(normalizedId, {
      connectorType: 'rfcomm',
      secure: false,
      connectionType: 'delimited',
      delimiter: '\n',
      deviceCharset: 'utf-8',
    });

    const finalId = normalizeAddress(device?.id || normalizedId);
    this.connectedDeviceId = finalId;

    this.removeDataListener = BluetoothClassic.onDataReceived((event: any) => {
      const dataChunk = String(event?.data ?? '');
      const frames = parseTelemetryChunk(dataChunk);
      frames.forEach((telemetry) => onTelemetry(telemetry));
    });

    const aliases = await this.getDeviceAliases();
    const normalized = normalizeDevice(device ?? { id: finalId }, aliases);

    return (
      normalized ?? {
        id: finalId,
        name: `HC05-${finalId.slice(-4)}`,
        displayName: aliases[finalId] || `HC05-${finalId.slice(-4)}`,
        alias: aliases[finalId],
      }
    );
  }

  async disconnect() {
    if (this.removeDataListener) {
      this.removeDataListener();
      this.removeDataListener = null;
    }

    if (this.connectedDeviceId && bluetoothClassicAvailable) {
      try {
        await BluetoothClassic.disconnectFromDevice(this.connectedDeviceId);
      } catch {
        // noop
      }
      this.connectedDeviceId = null;
    }
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
