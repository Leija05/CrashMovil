import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { TelemetryData } from '../store/crashStore';

/**
 * C.R.A.S.H. - Bluetooth Telemetry Service
 */

export interface ScanDevice {
  id: string;
  name: string;
}

export interface BluetoothStreamCallbacks {
  onHeartbeat?: () => void;
  onCrashSignal?: (gForce: number | null) => void;
  onUnknownLine?: (line: string) => void;
}

const DEFAULT_MODULE_NAMES = ['HM-10', 'HM10', 'HC-05', 'HC05', 'CRASH'];
const DEFAULT_SERVICE_UUIDS = ['FFE0', '180F'];
const DEFAULT_CHARACTERISTIC_UUIDS = ['FFE1', '2A19'];

let bleAvailable = false;
let manager: BleManager | null = null;

try {
  manager = new BleManager();
  bleAvailable = true;
} catch (error) {
  console.error('Bluetooth LE no disponible:', error);
  bleAvailable = false;
}

export const isBluetoothLeAvailable = () => bleAvailable;

const normalizeName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const decodeBase64 = (value: string) => {
  if (!value) return '';
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

interface ParsedTelemetryEnvelope {
  telemetry: TelemetryData | null;
  eventType: string | null;
}

const parseTelemetry = (payload: string): ParsedTelemetryEnvelope => {
  const cleanedPayload = payload.trim();
  if (!cleanedPayload) return { telemetry: null, eventType: null };

  try {
    const parsed = JSON.parse(cleanedPayload);
    const accArray = Array.isArray(parsed.acc) ? parsed.acc : [];
    const gyroArray = Array.isArray(parsed.gyro) ? parsed.gyro : [];
    const telemetry = {
      acceleration_x: Number(parsed.acceleration_x ?? parsed.ax ?? accArray[0] ?? 0),
      acceleration_y: Number(parsed.acceleration_y ?? parsed.ay ?? accArray[1] ?? 0),
      acceleration_z: Number(parsed.acceleration_z ?? parsed.az ?? accArray[2] ?? 0),
      gyro_x: Number(parsed.gyro_x ?? parsed.gx ?? gyroArray[0] ?? 0),
      gyro_y: Number(parsed.gyro_y ?? parsed.gy ?? gyroArray[1] ?? 0),
      gyro_z: Number(parsed.gyro_z ?? parsed.gz ?? gyroArray[2] ?? 0),
      g_force: Number(parsed.g_force ?? parsed.g ?? parsed.gforce ?? 0),
    };
    return {
      telemetry,
      eventType: typeof parsed.type === 'string' ? parsed.type.trim().toUpperCase() : null,
    };
  } catch {
    const parts = cleanedPayload.split(',').map((value) => Number(value.trim()));
    if (parts.length < 7 || parts.some((value) => Number.isNaN(value))) {
      return { telemetry: null, eventType: null };
    }
    return {
      telemetry: {
        acceleration_x: parts[0],
        acceleration_y: parts[1],
        acceleration_z: parts[2],
        gyro_x: parts[3],
        gyro_y: parts[4],
        gyro_z: parts[5],
        g_force: parts[6],
      },
      eventType: null,
    };
  }
};

const createTelemetryStreamParser = (
  onTelemetry: (telemetry: TelemetryData) => void,
  callbacks?: BluetoothStreamCallbacks
) => {
  let pending = '';
  let lastTelemetry: TelemetryData = {
    acceleration_x: 0,
    acceleration_y: 0,
    acceleration_z: 1,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
    g_force: 1,
  };

  const dispatchTelemetry = (telemetry: TelemetryData) => {
    lastTelemetry = telemetry;
    onTelemetry(telemetry);
  };

  const parseLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    const [rawType, rawValue] = line.split(':', 2);
    const type = rawType?.trim().toUpperCase();
    const numericValue = rawValue !== undefined ? Number.parseFloat(rawValue.trim()) : Number.NaN;

    if (type === 'OK') {
      callbacks?.onHeartbeat?.();
      return;
    }

    if (type === 'MOV' && Number.isFinite(numericValue)) {
      dispatchTelemetry({ ...lastTelemetry, g_force: numericValue });
      callbacks?.onHeartbeat?.();
      return;
    }

    if (type === 'CRASH') {
      const crashValue = Number.isFinite(numericValue) ? numericValue : null;
      if (crashValue !== null) {
        dispatchTelemetry({ ...lastTelemetry, g_force: crashValue });
      }
      callbacks?.onCrashSignal?.(crashValue);
      callbacks?.onHeartbeat?.();
      return;
    }

    const { telemetry, eventType } = parseTelemetry(line);
    if (telemetry) {
      dispatchTelemetry(telemetry);

      if (eventType === 'CRASH' || eventType === 'FREEFALL') {
        callbacks?.onCrashSignal?.(telemetry.g_force);
      }
      if (eventType === 'IDLE') {
        callbacks?.onHeartbeat?.();
        return;
      }

      callbacks?.onHeartbeat?.();
      return;
    }

    callbacks?.onUnknownLine?.(line);
  };

  return (chunk: string) => {
    if (!chunk) return;
    // Eliminamos caracteres nulos que el HC-05 suele enviar por ruido.
    pending = `${pending}${chunk}`.replace(/\0/g, '').replace(/\r/g, '');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';

    for (const line of lines) {
      parseLine(line);
    }
  };
};

class BluetoothTelemetryService {
  private monitorSubscription: Subscription | null = null;
  private connectedDevice: Device | null = null;
  private animationFrameId: number | null = null;
  private pendingTelemetry: TelemetryData | null = null;
  private isUserDisconnecting = false;
  private latestTelemetrySentAt = 0;
  private readonly telemetryThrottleMs = 220;
  private readonly minSignificantGForceDelta = 0.15;
  private lastTelemetryDispatched: TelemetryData | null = null;

  async requestPermissions() {
    if (Platform.OS !== 'android') return;
    const version = parseInt(String(Platform.Version), 10);
    if (version >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } else {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
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
        if (normalized && bluetoothDeviceNameMatcher(normalized.name, preferredNames)) {
          matches.set(normalized.id, normalized);
        }
      });
      setTimeout(() => {
        manager?.stopDeviceScan();
        resolve([...matches.values()]);
      }, 3500);
    });
  }

  private async establishConnection(
    deviceId: string, 
    onTelemetry: (telemetry: TelemetryData) => void,
    onDeviceDetected: (device: ScanDevice | null) => void,
    callbacks?: BluetoothStreamCallbacks
  ) {
    if (!manager || this.isUserDisconnecting) return;

    try {
      this.connectedDevice = await manager.connectToDevice(deviceId, { timeout: 10000 });
      onDeviceDetected(normalizeDevice(this.connectedDevice));
      if (Platform.OS === 'android') await this.connectedDevice.requestMTU(512);

      await this.connectedDevice.discoverAllServicesAndCharacteristics();

      // Reconexión automática más robusta
      this.connectedDevice.onDisconnected(() => {
        onDeviceDetected(null);
        if (!this.isUserDisconnecting) {
          console.warn('Reconectando...');
          // Delay para evitar bucles infinitos inmediatos
          setTimeout(() => this.establishConnection(deviceId, onTelemetry, onDeviceDetected, callbacks), 2000);
        }
      });

      const services = await this.connectedDevice.services();
      const service = services.find((s) => 
        DEFAULT_SERVICE_UUIDS.includes(s.uuid.slice(4, 8).toUpperCase())
      );
      
      if (!service) throw new Error('Servicio no compatible');

      const characteristics = await service.characteristics();
      const characteristic = characteristics.find((c) =>
        DEFAULT_CHARACTERISTIC_UUIDS.includes(c.uuid.slice(4, 8).toUpperCase())
      );

      if (!characteristic) throw new Error('Característica no compatible');

      // Función de envío optimizada para la UI
      const optimizedOnTelemetry = (data: TelemetryData) => {
        const now = Date.now();
        const shouldSendByTime = now - this.latestTelemetrySentAt >= this.telemetryThrottleMs;
        const lastG = this.lastTelemetryDispatched?.g_force ?? 0;
        const shouldSendByImpact = Math.abs(data.g_force - lastG) >= this.minSignificantGForceDelta;
        if (!shouldSendByTime && !shouldSendByImpact) return;

        this.latestTelemetrySentAt = now;
        this.lastTelemetryDispatched = data;
        this.pendingTelemetry = data;
        if (!this.animationFrameId) {
          this.animationFrameId = requestAnimationFrame(() => {
            if (this.pendingTelemetry) onTelemetry(this.pendingTelemetry);
            this.animationFrameId = null;
          });
        }
      };

      const streamParser = createTelemetryStreamParser(optimizedOnTelemetry, callbacks);

      this.monitorSubscription = characteristic.monitor((error, updated) => {
        if (error) return;
        if (updated?.value) streamParser(decodeBase64(updated.value));
      });

    } catch {
      onDeviceDetected(null);
      if (!this.isUserDisconnecting) {
        setTimeout(() => this.establishConnection(deviceId, onTelemetry, onDeviceDetected, callbacks), 3000);
      }
    }
  }

  async startPassiveTelemetryListener(
    preferredNames: string[],
    onDeviceDetected: (device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void,
    callbacks?: BluetoothStreamCallbacks
  ) {
    this.isUserDisconnecting = false;
    if (this.connectedDevice) {
      onDeviceDetected(normalizeDevice(this.connectedDevice));
      return; // Evitar múltiples conexiones
    }

    await this.requestPermissions();
    const candidates = await this.findHardwareCandidates(preferredNames);
    const matchedDevice = candidates[0] ?? null;

    if (matchedDevice) {
      await this.establishConnection(matchedDevice.id, onTelemetry, onDeviceDetected, callbacks);
    } else {
      onDeviceDetected(null);
    }
  }

  stopPassiveTelemetryListener() {
    this.isUserDisconnecting = true;
    if (this.monitorSubscription) {
      this.monitorSubscription.remove();
      this.monitorSubscription = null;
    }
    if (this.connectedDevice) {
      this.connectedDevice.cancelConnection().catch(() => undefined);
      this.connectedDevice = null;
    }
    manager?.stopDeviceScan();
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();
