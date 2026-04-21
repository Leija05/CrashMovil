import { create } from 'zustand';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  is_primary: boolean;
  verified?: boolean;
  opt_in_status?: 'pending' | 'verified' | 'revoked';
}

export interface ImpactEvent {
  id: string;
  timestamp: string;
  g_force: number;
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  latitude?: number;
  longitude?: number;
  was_false_alarm: boolean;
  ai_diagnosis?: string;
  alerts_dispatched?: number;
}

export interface DeviceSettings {
  id: string;
  device_name: string;
  impact_threshold: number;
  countdown_seconds: number;
  auto_call_enabled: boolean;
  sms_enabled: boolean;
  message_type: 'whatsapp';
  language: 'es' | 'en';
  theme: 'dark' | 'light';
}

export interface UserProfile {
  id: string;
  name: string;
  blood_type?: string;
  allergies?: string;
  medical_conditions?: string;
  emergency_notes?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  phone_number?: string;
  full_name?: string;
  auth_provider: 'password' | 'google' | 'apple';
  role?: 'user' | 'developer';
}

export interface TelemetryData {
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  g_force: number;
}

interface CrashStore {
  isConnected: boolean;
  connectedDeviceName: string | null;
  batteryLevel: number;
  isEmergencyActive: boolean;
  currentImpact: ImpactEvent | null;
  countdown: number;
  contacts: EmergencyContact[];
  impacts: ImpactEvent[];
  settings: DeviceSettings;
  profile: UserProfile | null;
  authToken: string | null;
  user: AuthUser | null;
  telemetry: TelemetryData;
  currentLocation: { latitude: number; longitude: number } | null;

  setConnected: (connected: boolean) => void;
  setConnectedDeviceName: (name: string | null) => void;
  setBatteryLevel: (level: number) => void;
  setEmergencyActive: (active: boolean) => void;
  setCurrentImpact: (impact: ImpactEvent | null) => void;
  setCountdown: (count: number | ((prev: number) => number)) => void;
  setContacts: (contacts: EmergencyContact[]) => void;
  addContact: (contact: EmergencyContact) => void;
  removeContact: (id: string) => void;
  setImpacts: (impacts: ImpactEvent[]) => void;
  addImpact: (impact: ImpactEvent) => void;
  setSettings: (settings: DeviceSettings) => void;
  updateSettings: (settings: Partial<DeviceSettings>) => void;
  setProfile: (profile: UserProfile | null) => void;
  setAuthSession: (token: string | null, user: AuthUser | null) => void;
  setTelemetry: (telemetry: TelemetryData) => void;
  setCurrentLocation: (location: { latitude: number; longitude: number } | null) => void;
}

const defaultSettings: DeviceSettings = {
  id: 'default',
  device_name: 'HM-10',
  impact_threshold: 5.0,
  countdown_seconds: 30,
  auto_call_enabled: true,
  sms_enabled: false,
  message_type: 'whatsapp',
  language: 'es',
  theme: 'dark',
};

const defaultTelemetry: TelemetryData = {
  acceleration_x: 0,
  acceleration_y: 0,
  acceleration_z: 1,
  gyro_x: 0,
  gyro_y: 0,
  gyro_z: 0,
  g_force: 1,
};

export const useCrashStore = create<CrashStore>((set) => ({
  isConnected: false,
  connectedDeviceName: null,
  batteryLevel: 94,
  isEmergencyActive: false,
  currentImpact: null,
  countdown: 30,
  contacts: [],
  impacts: [],
  settings: defaultSettings,
  profile: null,
  authToken: null,
  user: null,
  telemetry: defaultTelemetry,
  currentLocation: null,

  setConnected: (connected) => set({ isConnected: connected }),
  setConnectedDeviceName: (name) => set({ connectedDeviceName: name }),
  setBatteryLevel: (level) => set({ batteryLevel: level }),
  setEmergencyActive: (active) => set({ isEmergencyActive: active }),
  setCurrentImpact: (impact) => set({ currentImpact: impact }),
  setCountdown: (countOrFn) => {
    if (typeof countOrFn === 'function') {
      set((state) => ({ countdown: countOrFn(state.countdown) }));
    } else {
      set({ countdown: countOrFn });
    }
  },

  setContacts: (contacts) => set({ contacts }),
  addContact: (contact) => set((state) => ({ contacts: [...state.contacts, contact] })),
  removeContact: (id) => set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) })),

  setImpacts: (impacts) => set({ impacts }),
  addImpact: (impact) => set((state) => ({ impacts: [impact, ...state.impacts] })),

  setSettings: (settings) => set({ settings }),
  updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  setProfile: (profile) => set({ profile }),
  setAuthSession: (token, user) => set({ authToken: token, user }),
  setTelemetry: (telemetry) => set({ telemetry }),
  setCurrentLocation: (location) => set({ currentLocation: location }),
}));
