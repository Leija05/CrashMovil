// src/services/bluetooth.ts
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, LogLevel } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { TelemetryData } from '../store/crashStore';

if (!global.Buffer) { global.Buffer = Buffer; }

export interface ScanDevice { id: string; name: string; }

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export const isBluetoothLeAvailable = () => true;

export const bluetoothDeviceNameMatcher = (deviceName?: string, preferredNames: string[] = []) => {
  if (!deviceName) return false;
  const normalized = deviceName.trim().toUpperCase();
  const targets = [...preferredNames, 'HC-05', 'HC05', 'HM-10', 'CRASH'].map(n => n.toUpperCase());
  return targets.some(t => normalized.includes(t));
};

class BluetoothTelemetryService {
  private bleManager = new BleManager();
  private connectedDevice: Device | null = null;
  private monitorSubscription: Subscription | null = null;
  private readBuffer = '';
  private lastEmitTime = 0;
  private throttleMs = 32; // ~30 FPS para fluidez

  constructor() {
    this.bleManager.setLogLevel(LogLevel.None);
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const api = parseInt(Platform.Version.toString(), 10);
      const perms = api >= 31 
        ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return Object.values(granted).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
    } catch { return false; }
  }

  async findHardwareCandidates(preferredNames: string[] = []): Promise<ScanDevice[]> {
    await this.requestPermissions();
    return new Promise((resolve) => {
      const candidates = new Map<string, ScanDevice>();
      this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (device && bluetoothDeviceNameMatcher(device.name || device.localName, preferredNames)) {
          candidates.set(device.id, { id: device.id, name: device.name || device.localName || 'Unknown' });
        }
      });
      setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(Array.from(candidates.values()));
      }, 3500);
    });
  }

  async startPassiveTelemetryListener(
    preferredNames: string[],
    onDeviceDetected: (device: ScanDevice | null) => void,
    onTelemetry: (telemetry: TelemetryData) => void
  ) {
    this.stopPassiveTelemetryListener();
    const candidates = await this.findHardwareCandidates(preferredNames);
    if (candidates.length > 0 && candidates[0].id) {
      onDeviceDetected(candidates[0]);
      await this.connectToDevice(candidates[0].id, onTelemetry);
    }
  }

  async connectToDevice(id: string, onTelemetry: (telemetry: TelemetryData) => void) {
    try {
      const device = await this.bleManager.connectToDevice(id);
      await new Promise(r => setTimeout(r, 1200)); 
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;

      device.onDisconnected(() => this.stopPassiveTelemetryListener());

      this.monitorSubscription = device.monitorCharacteristicForService(
        SERVICE_UUID, CHARACTERISTIC_UUID, (err, char) => {
          if (char?.value) {
            const raw = Buffer.from(char.value, 'base64').toString('utf-8');
            this.processData(raw, onTelemetry);
          }
        }
      );
    } catch (e) { console.log("Error conexión:", e); }
  }

  private processData(data: string, onTelemetry: (telemetry: TelemetryData) => void) {
    this.readBuffer += data;
    let idx = this.readBuffer.indexOf('\n');
    while (idx !== -1) {
      const line = this.readBuffer.slice(0, idx).trim();
      this.readBuffer = this.readBuffer.slice(idx + 1);
      
      const now = Date.now();
      const n = line.split(',').map(parseFloat);
      if (n.length >= 7 && !n.some(isNaN)) {
        const isHighImpact = n[6] > 3.0;
        if (isHighImpact || (now - this.lastEmitTime > this.throttleMs)) {
          onTelemetry({
            acceleration_x: n[0], acceleration_y: n[1], acceleration_z: n[2],
            gyro_x: n[3], gyro_y: n[4], gyro_z: n[5],
            g_force: n[6]
          });
          this.lastEmitTime = now;
        }
      }
      idx = this.readBuffer.indexOf('\n');
    }
  }

  stopPassiveTelemetryListener() {
    if (this.monitorSubscription) this.monitorSubscription.remove();
    if (this.connectedDevice) this.connectedDevice.cancelConnection().catch(() => null);
    this.bleManager.stopDeviceScan();
    this.readBuffer = '';
  }
}

export const bluetoothTelemetryService = new BluetoothTelemetryService();