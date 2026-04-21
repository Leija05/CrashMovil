import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { bluetoothService, TelemetryData, ScanDevice, BluetoothStatus } from '../services/bluetooth';

type BluetoothCtx = {
  status: BluetoothStatus;
  statusDetail?: string;
  connected: boolean;
  device: ScanDevice | null;
  telemetry: TelemetryData | null;
  nativeAvailable: boolean;
  bluetoothEnabled: boolean;
  refreshAdapter: () => Promise<void>;
  requestEnableBluetooth: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  startDeviceScan: (onFound: (d: ScanDevice) => void) => Promise<void>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  listPairedDevices: () => Promise<ScanDevice[]>; // Dummy para compat
  listAllPairedDevices: () => Promise<ScanDevice[]>; // Dummy para compat
};

const BluetoothContext = createContext<BluetoothCtx>({} as any);
export const useBluetooth = () => useContext(BluetoothContext);

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);

  useEffect(() => {
    const unsubT = bluetoothService.onTelemetry(setTelemetry);
    const unsubS = bluetoothService.onStatus((s: any, detail: any) => {
      setStatus(s); setStatusDetail(detail);
      setConnected(bluetoothService.isConnected());
    });
    const unsubD = bluetoothService.onDeviceChange(setDevice);
    return () => { unsubT(); unsubS(); unsubD(); };
  }, []);

  const refreshAdapter = useCallback(async () => {
    setBluetoothEnabled(await bluetoothService.isBluetoothEnabled());
  }, []);

  return (
    <BluetoothContext.Provider value={{
      status, statusDetail, connected, device, telemetry, 
      nativeAvailable: bluetoothService.isNativeAvailable(), 
      bluetoothEnabled,
      refreshAdapter,
      requestEnableBluetooth: () => bluetoothService.requestEnableBluetooth(),
      requestPermissions: () => bluetoothService.requestPermissions(),
      startDeviceScan: (onFound) => bluetoothService.startDeviceScan(onFound),
      connect: (id) => bluetoothService.connectToDevice(id),
      disconnect: () => bluetoothService.disconnect(),
      listPairedDevices: () => bluetoothService.listPairedDevices(),
      listAllPairedDevices: () => bluetoothService.listAllPairedDevices(),
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}