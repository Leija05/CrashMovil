import { PermissionsAndroid, Platform } from 'react-native';
import { TelemetryData } from '../store/crashStore';

// --- Interfaces y Tipos ---

export interface ScanDevice {
  id: string;
  name: string;
}

type BluetoothClassicModule = {
  requestBluetoothEnabled: () => Promise<boolean>;
  isBluetoothEnabled: () => Promise<boolean>;
  startDiscovery: () => Promise<any[]>;
  connectToDevice: (deviceId: string, options?: Record<string, unknown>) => Promise<any>;
  onDataReceived: (handler: (event: any) => void) => { remove: () => void };
  disconnectFromDevice: (deviceId: string) => Promise<void>;
  getBondedDevices: () => Promise<any[]>;
  cancelDiscovery: () => Promise<void>;
};

// --- Configuración de Carga Dinámica ---

const createBluetoothUnavailableError = () =>
  new Error('Bluetooth Classic no disponible. Revisa la configuración nativa en Android.');

let bluetoothClassicAvailable = true;

const loadBluetoothClassic = (): BluetoothClassicModule => {
  try {
    // Evita que Metro explote si la librería no está vinculada nativamente
    const dynamicRequire = eval('require') as (moduleName: string) => any;
    const module = dynamicRequire('react-native-bluetooth-classic');
    return (module?.default ?? module) as BluetoothClassicModule;
  } catch {
    bluetoothClassicAvailable = false;
    return {
      requestBluetoothEnabled: async () => { throw createBluetoothUnavailableError(); },
      isBluetoothEnabled: async () => false,
      startDiscovery: async () => { throw createBluetoothUnavailableError(); },
      connectToDevice: async () => { throw createBluetoothUnavailableError(); },
      onDataReceived: () => ({ remove: () => undefined }),
      disconnectFromDevice: async () => undefined,
      getBondedDevices: async () => [],
      cancelDiscovery: async () => undefined,
    };
  }
};

const BluetoothClassic = loadBluetoothClassic();
export const isBluetoothClassicAvailable = () => bluetoothClassicAvailable;

// --- Funciones Auxiliares de Procesamiento ---

const normalizeDevice = (device: any): ScanDevice | null => {
  if (!device?.id) return null;
  return {
    id: String(device.id),
    name: (device.name || `HC-05 [${String(device.id).slice(-4)}]`).trim(),
  };
};

const parseTelemetry = (payload: string): TelemetryData | null => {
  const cleaned = payload.trim();
  if (!cleaned) return null;

  try {
    // Intento 1: JSON
    const parsed = JSON.parse(cleaned);
    return {
      acceleration_x: Number(parsed.acceleration_x ?? parsed.ax ?? 0),
      acceleration_y: Number(parsed.acceleration_y ?? parsed.ay ?? 0),
      acceleration_z: Number(parsed.acceleration_z ?? parsed.az ?? 0),
      gyro_x: Number(parsed.gyro_x ?? parsed.gx ?? 0),
      gyro_y: Number(parsed.gyro_y ?? parsed.gy ?? 0),
      gyro_z: Number(parsed.gyro_z ?? parsed.gz ?? 0),
      g_force: Number(parsed.g_force ?? parsed.g ?? 0),
    };
  } catch {
    // Intento 2: CSV (ax, ay, az, gx, gy, gz, gforce)
    const parts = cleaned.split(',').map(v => Number(v.trim()));
    if (parts.length >= 7 && !parts.some(isNaN)) {
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
  }
  return null;
};

// --- Clase de Servicio Principal ---

class BluetoothTelemetryService {
  private dataSubscription: { remove: () => void } | null = null;
  private connectedDeviceId: string | null = null;
  private dataBuffer: string = '';

  /**
   * Solicita permisos necesarios según la versión de Android
   */
  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

    if (apiLevel >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  }

  /**
   * Busca dispositivos vinculados y disponibles
   */
  async findDevices(timeoutMs = 15000): Promise<ScanDevice[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) throw new Error('Permisos de Bluetooth denegados.');

    await BluetoothClassic.requestBluetoothEnabled();

    try {
      // Obtenemos vinculados y escaneamos nuevos en paralelo
      const [bonded, discovered] = await Promise.all([
        BluetoothClassic.getBondedDevices().catch(() => []),
        Promise.race([
          BluetoothClassic.startDiscovery(),
          new Promise<any[]>((_, reject) => setTimeout(() => reject('timeout'), timeoutMs))
        ]).catch(err => {
          if (err === 'timeout') BluetoothClassic.cancelDiscovery();
          return [];
        })
      ]);

      const allDevices = [...bonded, ...discovered]
        .map(normalizeDevice)
        .filter((d): d is ScanDevice => d !== null);

      // Eliminar duplicados por ID
      return Array.from(new Map(allDevices.map(d => [d.id, d])).values());
    } catch (error) {
      console.error('Error al buscar dispositivos:', error);
      return [];
    }
  }

  /**
   * Se conecta a un dispositivo e inicia la escucha de telemetría
   */
  async connect(deviceId: string, onTelemetry: (data: TelemetryData) => void): Promise<void> {
    this.disconnect();

    try {
      const device = await BluetoothClassic.connectToDevice(deviceId, {
        delimiter: '\n',
        deviceCharset: 'utf-8',
      });

      this.connectedDeviceId = deviceId;
      this.dataBuffer = '';

      // Suscripción a datos con manejo de Buffer
      this.dataSubscription = BluetoothClassic.onDataReceived((event) => {
        const rawData: string = event?.data ?? '';
        this.dataBuffer += rawData;

        if (this.dataBuffer.includes('\n')) {
          const lines = this.dataBuffer.split('\n');
          // El último elemento puede estar incompleto, lo guardamos para el siguiente ciclo
          this.dataBuffer = lines.pop() || '';

          lines.forEach(line => {
            const telemetry = parseTelemetry(line);
            if (telemetry) onTelemetry(telemetry);
          });
        }
      });

      console.log(`Conectado exitosamente a: ${deviceId}`);
    } catch (error) {
      this.disconnect();
      throw new Error(`Error de conexión: ${error}`);
    }
  }

  /**
   * Finaliza la conexión y limpia suscripciones
   */
  disconnect() {
    if (this.dataSubscription) {
      this.dataSubscription.remove();
      this.dataSubscription = null;
    }

    if (this.connectedDeviceId) {
      BluetoothClassic.disconnectFromDevice(this.connectedDeviceId).catch(() => undefined);
      this.connectedDeviceId = null;
    }
    this.dataBuffer = '';
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();