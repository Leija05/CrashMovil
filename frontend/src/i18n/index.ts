import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  es: {
    translation: {
      // Navigation
      home: 'Inicio',
      contacts: 'Contactos',
      history: 'Historial',
      settings: 'Ajustes',
      profile: 'Perfil',
      
      // Home Screen
      systemActive: 'Sistema Activo',
      systemInactive: 'Sistema Inactivo',
      linkedDevice: 'Dispositivo Vinculado',
      notConnected: 'No Conectado',
      battery: 'Batería',
      records: 'Registros',
      realTimeTelemetry: 'Telemetría en Tiempo Real',
      connectDevice: 'Conectar Dispositivo',
      
      // Emergency
      emergencyDetected: '¡EMERGENCIA DETECTADA!',
      impactDetected: 'Impacto detectado',
      cancelAlarm: 'Cancelar Alarma',
      sendingAlert: 'Enviando alerta en',
      seconds: 'segundos',
      alertSent: 'Alerta enviada',
      falseAlarm: 'Falsa alarma cancelada',
      
      // Contacts
      emergencyContacts: 'Contactos de Emergencia',
      addContact: 'Agregar Contacto',
      name: 'Nombre',
      phone: 'Teléfono',
      relationship: 'Relación',
      primaryContact: 'Contacto Principal',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      noContacts: 'No hay contactos de emergencia',
      
      // History
      impactHistory: 'Historial de Impactos',
      noImpacts: 'No hay registros de impactos',
      severity: 'Severidad',
      gForce: 'Fuerza G',
      location: 'Ubicación',
      viewDiagnosis: 'Ver Diagnóstico',
      markedFalseAlarm: 'Marcado como falsa alarma',
      
      // Settings
      deviceSettings: 'Configuración del Dispositivo',
      deviceName: 'Nombre del Dispositivo',
      impactThreshold: 'Umbral de Impacto (G)',
      countdownTime: 'Tiempo de Cuenta Regresiva (s)',
      autoCall: 'Llamada Automática',
      smsAlert: 'Alerta WhatsApp',
      language: 'Idioma',
      theme: 'Tema',
      dark: 'Oscuro',
      light: 'Claro',
      
      // Profile
      userProfile: 'Perfil de Usuario',
      bloodType: 'Tipo de Sangre',
      allergies: 'Alergias',
      medicalConditions: 'Condiciones Médicas',
      emergencyNotes: 'Notas de Emergencia',
      
      // AI Diagnosis
      aiDiagnosis: 'Diagnóstico IA',
      severityAssessment: 'Evaluación de Severidad',
      probableInjuries: 'Lesiones Probables',
      firstAidSteps: 'Pasos de Primeros Auxilios',
      warnings: 'Advertencias',
      recommendation: 'Recomendación',
      loading: 'Cargando...',
      
      // Severity levels
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      critical: 'Crítica',
      
      // Relationships
      family: 'Familiar',
      friend: 'Amigo',
      spouse: 'Pareja',
      parent: 'Padre/Madre',
      sibling: 'Hermano/a',
      other: 'Otro',
    },
  },
  en: {
    translation: {
      // Navigation
      home: 'Home',
      contacts: 'Contacts',
      history: 'History',
      settings: 'Settings',
      profile: 'Profile',
      
      // Home Screen
      systemActive: 'System Active',
      systemInactive: 'System Inactive',
      linkedDevice: 'Linked Device',
      notConnected: 'Not Connected',
      battery: 'Battery',
      records: 'Records',
      realTimeTelemetry: 'Real-Time Telemetry',
      connectDevice: 'Connect Device',
      
      // Emergency
      emergencyDetected: 'EMERGENCY DETECTED!',
      impactDetected: 'Impact detected',
      cancelAlarm: 'Cancel Alarm',
      sendingAlert: 'Sending alert in',
      seconds: 'seconds',
      alertSent: 'Alert sent',
      falseAlarm: 'False alarm cancelled',
      
      // Contacts
      emergencyContacts: 'Emergency Contacts',
      addContact: 'Add Contact',
      name: 'Name',
      phone: 'Phone',
      relationship: 'Relationship',
      primaryContact: 'Primary Contact',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      noContacts: 'No emergency contacts',
      
      // History
      impactHistory: 'Impact History',
      noImpacts: 'No impact records',
      severity: 'Severity',
      gForce: 'G-Force',
      location: 'Location',
      viewDiagnosis: 'View Diagnosis',
      markedFalseAlarm: 'Marked as false alarm',
      
      // Settings
      deviceSettings: 'Device Settings',
      deviceName: 'Device Name',
      impactThreshold: 'Impact Threshold (G)',
      countdownTime: 'Countdown Time (s)',
      autoCall: 'Auto Call',
      smsAlert: 'WhatsApp Alert',
      language: 'Language',
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      
      // Profile
      userProfile: 'User Profile',
      bloodType: 'Blood Type',
      allergies: 'Allergies',
      medicalConditions: 'Medical Conditions',
      emergencyNotes: 'Emergency Notes',
      
      // AI Diagnosis
      aiDiagnosis: 'AI Diagnosis',
      severityAssessment: 'Severity Assessment',
      probableInjuries: 'Probable Injuries',
      firstAidSteps: 'First Aid Steps',
      warnings: 'Warnings',
      recommendation: 'Recommendation',
      loading: 'Loading...',
      
      // Severity levels
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
      
      // Relationships
      family: 'Family',
      friend: 'Friend',
      spouse: 'Spouse',
      parent: 'Parent',
      sibling: 'Sibling',
      other: 'Other',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'es',
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
