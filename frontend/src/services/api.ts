import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://device-crash-tool.preview.emergentagent.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Auth
export const authApi = {
  register: (data: { email: string; password: string; full_name?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  oauthLogin: (data: { provider: 'google' | 'apple'; email: string; provider_token: string; full_name?: string }) =>
    api.post('/auth/oauth', data),
  me: () => api.get('/auth/me'),
};

// Emergency Contacts
export const contactsApi = {
  getAll: () => api.get('/contacts'),
  create: (data: { name: string; phone: string; relationship: string; is_primary: boolean }) =>
    api.post('/contacts', data),
  update: (id: string, data: { name: string; phone: string; relationship: string; is_primary: boolean }) =>
    api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  confirmOptIn: (data: { token: string; response_text: string }) => api.post('/contacts/opt-in/confirm', data),
};

// Impact Events
export const impactsApi = {
  getAll: (limit = 50) => api.get(`/impacts?limit=${limit}`),
  create: (data: {
    g_force: number;
    acceleration_x: number;
    acceleration_y: number;
    acceleration_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    latitude?: number;
    longitude?: number;
  }) => api.post('/impacts', data),
  getById: (id: string) => api.get(`/impacts/${id}`),
  markFalseAlarm: (id: string) => api.put(`/impacts/${id}/false-alarm`),
};

// Device Settings
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: Partial<{
    device_name: string;
    impact_threshold: number;
    countdown_seconds: number;
    auto_call_enabled: boolean;
    sms_enabled: boolean;
    message_type: 'sms' | 'whatsapp';
    language: string;
    theme: string;
  }>) => api.put('/settings', data),
};

// User Profile
export const profileApi = {
  get: () => api.get('/profile'),
  createOrUpdate: (data: {
    name: string;
    blood_type?: string;
    allergies?: string;
    medical_conditions?: string;
    emergency_notes?: string;
  }) => api.post('/profile', data),
};

// AI Diagnosis
export const diagnosisApi = {
  get: (data: {
    g_force: number;
    acceleration_x: number;
    acceleration_y: number;
    acceleration_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    blood_type?: string;
    allergies?: string;
    medical_conditions?: string;
    language: string;
  }) => api.post('/diagnosis', data),
};

// Statistics
export const statsApi = {
  get: () => api.get('/stats'),
};

// Health check
export const healthApi = {
  check: () => api.get('/health'),
};

export default api;
