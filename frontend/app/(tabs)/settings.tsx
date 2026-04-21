import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import { useCrashStore } from '../../src/store/crashStore';
import { diagnosisApi, impactsApi, settingsApi } from '../../src/services/api';
import i18n from '../../src/i18n';
import {
  bluetoothTelemetryService,
  bluetoothDeviceNameMatcher,
  isBluetoothLeAvailable,
} from '../../src/services/bluetooth';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings, setConnected, setConnectedDeviceName, user } = useCrashStore();

  const isDark = settings.theme === 'dark';
  const [deviceName, setDeviceName] = useState(settings.device_name);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [devGForce, setDevGForce] = useState(String(Math.max(8, settings.impact_threshold + 2)));
  const [devRunning, setDevRunning] = useState(false);
  const [devAiSummary, setDevAiSummary] = useState<string | null>(null);
  const toast = (message: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
    else Alert.alert('CRASH Safety', message);
  };

  useEffect(() => {
    if (settings.message_type !== 'whatsapp' || settings.sms_enabled) {
      handleUpdateSettings({ message_type: 'whatsapp', sms_enabled: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateSettings = async (updates: Partial<typeof settings>) => {
    try {
      updateSettings(updates);
      if (user) {
        await settingsApi.update(updates);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const handleLanguageChange = (lang: 'es' | 'en') => {
    i18n.changeLanguage(lang);
    handleUpdateSettings({ language: lang });
  };

  const handleThemeChange = (theme: 'dark' | 'light') => {
    handleUpdateSettings({ theme });
  };

  const detectPairedModule = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Escaneo Bluetooth LE para HM-10/HC-05 solo está disponible en Android.');
      return;
    }

    if (!isBluetoothLeAvailable()) {
      Alert.alert(
        settings.language === 'es' ? 'Módulo Bluetooth LE no disponible' : 'Bluetooth module unavailable',
        settings.language === 'es'
          ? 'Esta build no incluye soporte nativo para Bluetooth LE.'
          : 'This build does not include native BLE support.'
      );
      return;
    }

    setIsScanning(true);
    try {
      const candidates = await bluetoothTelemetryService.findHardwareCandidates([
        deviceName,
        settings.device_name,
        'HC-05',
        'HM-10',
      ]);

      const match = candidates.find((device) =>
        bluetoothDeviceNameMatcher(device.name, [deviceName, settings.device_name, 'HC-05', 'HM-10'])
      );

      if (!match) {
        setDetectedName(null);
        setConnected(false);
        setConnectedDeviceName(null);
        Alert.alert(
          settings.language === 'es' ? 'Sin coincidencias' : 'No matches',
          settings.language === 'es'
            ? 'No se encontró un dispositivo BLE llamado HC-05 o HM-10.'
            : 'No BLE device named HC-05 or HM-10 was found.'
        );
        return;
      }

      setDetectedName(match.name);
      setConnected(true);
      setConnectedDeviceName(match.name);
      setDeviceName(match.name);
      await handleUpdateSettings({ device_name: match.name });

      Alert.alert(
        settings.language === 'es' ? 'Dispositivo detectado' : 'Device detected',
        settings.language === 'es'
          ? `Se detectó ${match.name}. La app quedará en escucha pasiva de telemetría.`
          : `${match.name} detected. App will stay in passive telemetry listening mode.`
      );
      toast(settings.language === 'es' ? 'Telemetría BLE conectada' : 'BLE telemetry connected');
    } catch (error) {
      console.error('Bluetooth detection error:', error);
      Alert.alert(
        settings.language === 'es' ? 'Error Bluetooth' : 'Bluetooth error',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeviceNameSave = () => {
    if (!deviceName.trim()) return;
    handleUpdateSettings({ device_name: deviceName.trim() });
  };

  const startDeveloperCountdownPreview = () => {
    const { setCountdown, setEmergencyActive } = useCrashStore.getState();
    setEmergencyActive(true);
    setCountdown(settings.countdown_seconds);
    let current = settings.countdown_seconds;
    const timer = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        setCountdown(0);
        setEmergencyActive(false);
        clearInterval(timer);
        return;
      }
      setCountdown(current);
    }, 1000);
  };

  const runDeveloperSimulation = async () => {
    if (!user || user.role !== 'developer') return;
    const numericG = Number(devGForce);
    const safeG = Number.isFinite(numericG) ? Math.max(1, numericG) : settings.impact_threshold + 2;
    const telemetryPayload = {
      g_force: safeG,
      acceleration_x: safeG / 2,
      acceleration_y: safeG / 3,
      acceleration_z: 1 + safeG / 4,
      gyro_x: safeG * 0.8,
      gyro_y: safeG * 0.6,
      gyro_z: safeG * 0.4,
      latitude: 19.4326,
      longitude: -99.1332,
    };

    const {
      setConnected: setStoreConnected,
      setConnectedDeviceName: setStoreConnectedDeviceName,
      setTelemetry,
      setCurrentImpact,
      setEmergencyActive,
      setCountdown,
      countdown,
    } = useCrashStore.getState();

    setDevRunning(true);
    try {
      setStoreConnected(true);
      setStoreConnectedDeviceName('DEV-SIM-BTL');
      setTelemetry(telemetryPayload);

      const diagnosis = await diagnosisApi.get({
        ...telemetryPayload,
        blood_type: undefined,
        allergies: undefined,
        medical_conditions: undefined,
        language: settings.language,
      });
      setDevAiSummary(diagnosis.data?.severity_assessment ?? null);

      const impactResponse = await impactsApi.create(telemetryPayload);
      setCurrentImpact(impactResponse.data);
      setEmergencyActive(true);
      setCountdown(countdown || settings.countdown_seconds);
      startDeveloperCountdownPreview();

      toast(
        settings.language === 'es'
          ? 'Simulación completada: IA + impacto + alertas enviadas.'
          : 'Simulation completed: AI + impact + alerts sent.',
      );
    } catch (error) {
      Alert.alert(
        settings.language === 'es' ? 'Error simulación' : 'Simulation error',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setDevRunning(false);
    }
  };

  const simulateDeveloperBluetoothDisconnect = () => {
    const { setConnected: setStoreConnected, setConnectedDeviceName: setStoreConnectedDeviceName } = useCrashStore.getState();
    setStoreConnected(false);
    setStoreConnectedDeviceName(null);
    toast(settings.language === 'es' ? 'Bluetooth simulado desconectado.' : 'Simulated Bluetooth disconnected.');
  };

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <LinearGradient
        colors={isDark ? ['#050505', '#06122A'] : ['#F7FAFF', '#DEE9FF']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{t('deviceSettings')}</Text>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeaderCompact}>
            <View>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('deviceName')}</Text>
              <Text style={styles.sectionSubtitle}>HM-10 / HC-05 (BLE)</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="logo-whatsapp" size={14} color="#22c55e" />
              <Text style={styles.badgeText}>WhatsApp</Text>
            </View>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="HM-10"
              placeholderTextColor="#888"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleDeviceNameSave}>
              <Ionicons name="checkmark" size={20} color="#001017" />
            </TouchableOpacity>
          </View>
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Detección pasiva Bluetooth LE' : 'Passive Bluetooth LE detection'}
            </Text>
            {isScanning && <ActivityIndicator size="small" color="#00d9ff" />}
          </View>
          <Text style={styles.sectionSubtitle}>
            {settings.language === 'es'
              ? 'La app inicia exploración BLE y se suscribe a notificaciones del módulo HM-10/HC-05 para telemetría.'
              : 'App starts BLE scan and subscribes to HM-10/HC-05 notifications for telemetry.'}
          </Text>
          <TouchableOpacity style={styles.scanButton} onPress={detectPairedModule} disabled={isScanning}>
            <Ionicons name="bluetooth" size={18} color="#fff" />
            <Text style={styles.scanButtonText}>
              {isScanning
                ? (settings.language === 'es' ? 'Detectando...' : 'Detecting...')
                : (settings.language === 'es' ? 'Buscar módulo BLE' : 'Find BLE module')}
            </Text>
          </TouchableOpacity>
          {!!detectedName && (
            <Text style={styles.detectedText}>
              {settings.language === 'es' ? 'Detectado:' : 'Detected:'} {detectedName}
            </Text>
          )}
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('impactThreshold')}</Text>
            <Text style={styles.valueText}>{settings.impact_threshold.toFixed(1)}G</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={2}
            maximumValue={15}
            step={0.5}
            value={settings.impact_threshold}
            onSlidingComplete={(value) => handleUpdateSettings({ impact_threshold: value })}
            minimumTrackTintColor="#00d9ff"
            maximumTrackTintColor="#1e293b"
            thumbTintColor="#00d9ff"
          />
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Tiempo para cancelar alerta' : 'Alert cancellation timer'}
            </Text>
            <Text style={styles.valueText}>{settings.countdown_seconds}s</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={10}
            maximumValue={60}
            step={5}
            value={settings.countdown_seconds}
            onSlidingComplete={(value) => handleUpdateSettings({ countdown_seconds: value })}
            minimumTrackTintColor="#22d3ee"
            maximumTrackTintColor="#1e293b"
            thumbTintColor="#22d3ee"
          />
          <Text style={styles.switchHint}>
            {settings.language === 'es'
              ? 'Entre más alto el valor, más tiempo para cancelar falsa alarma.'
              : 'Higher values give more time to cancel false alarms.'}
          </Text>
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>{t('autoCall')}</Text>
              <Text style={styles.switchHint}>911 / contacto principal</Text>
            </View>
            <Switch
              value={settings.auto_call_enabled}
              onValueChange={(value) => handleUpdateSettings({ auto_call_enabled: value })}
              trackColor={{ false: '#334155', true: '#0ea5e9' }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.toggleRow, styles.toggleRowSpacing]}>
            <View>
              <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>{t('smsAlert')}</Text>
              <Text style={styles.switchHint}>Canal fijo oficial</Text>
            </View>
            <Switch
              value={true}
              onValueChange={() => handleUpdateSettings({ message_type: 'whatsapp', sms_enabled: false })}
              trackColor={{ false: '#334155', true: '#22c55e' }}
              thumbColor="#fff"
            />
          </View>
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('language')}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, settings.language === 'es' && styles.optionButtonActive]}
              onPress={() => handleLanguageChange('es')}
            >
              <Text style={settings.language === 'es' ? styles.optionTextActive : undefined}>Español</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, settings.language === 'en' && styles.optionButtonActive]}
              onPress={() => handleLanguageChange('en')}
            >
              <Text style={settings.language === 'en' ? styles.optionTextActive : undefined}>English</Text>
            </TouchableOpacity>
          </View>
        </BlurView>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('theme')}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, settings.theme === 'dark' && styles.optionButtonActive]}
              onPress={() => handleThemeChange('dark')}
            >
              <Text style={settings.theme === 'dark' ? styles.optionTextActive : undefined}>{t('dark')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, settings.theme === 'light' && styles.optionButtonActive]}
              onPress={() => handleThemeChange('light')}
            >
              <Text style={settings.theme === 'light' ? styles.optionTextActive : undefined}>{t('light')}</Text>
            </TouchableOpacity>
          </View>
        </BlurView>

        {user?.role === 'developer' && (
          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                {settings.language === 'es' ? 'Developer Lab (sin circuito)' : 'Developer Lab (no hardware)'}
              </Text>
              {devRunning && <ActivityIndicator size="small" color="#22d3ee" />}
            </View>
            <Text style={styles.sectionSubtitle}>
              {settings.language === 'es'
                ? 'Prueba IA, detección de fuerza, cuenta regresiva, envío de alertas y Bluetooth usando datos simulados.'
                : 'Test AI, force detection, countdown, emergency dispatch and Bluetooth using simulated data.'}
            </Text>
            <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Fuerza simulada (G)' : 'Simulated force (G)'}
            </Text>
            <TextInput
              keyboardType="decimal-pad"
              value={devGForce}
              onChangeText={setDevGForce}
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="9.5"
              placeholderTextColor="#888"
            />
            <View style={styles.devRow}>
              <TouchableOpacity style={styles.devPrimaryButton} onPress={runDeveloperSimulation} disabled={devRunning}>
                <Ionicons name="flask" size={16} color="#001017" />
                <Text style={styles.devPrimaryText}>
                  {settings.language === 'es' ? 'Ejecutar test integral' : 'Run full test'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.devSecondaryButton} onPress={simulateDeveloperBluetoothDisconnect}>
                <Ionicons name="bluetooth" size={16} color="#fff" />
                <Text style={styles.devSecondaryText}>
                  {settings.language === 'es' ? 'BTL OFF' : 'BTL OFF'}
                </Text>
              </TouchableOpacity>
            </View>
            {!!devAiSummary && (
              <Text style={styles.devSummaryText}>
                IA: {devAiSummary}
              </Text>
            )}
          </BlurView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#050505' },
  containerLight: { backgroundColor: '#f3f5fa' },
  scrollContent: { padding: 20, paddingBottom: 90 },
  title: { fontSize: 30, fontWeight: '800', marginBottom: 16 },
  textDark: { color: '#fff' },
  textLight: { color: '#0f172a' },
  section: { borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1 },
  sectionDark: { backgroundColor: 'rgba(12,16,28,0.72)', borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  sectionLight: { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(15,23,42,0.18)', overflow: 'hidden' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  sectionSubtitle: { color: '#94a3b8', marginBottom: 12, fontSize: 13, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeaderCompact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  input: { flex: 1, borderRadius: 12, padding: 13, fontSize: 16 },
  inputDark: { backgroundColor: '#1e293b', color: '#fff' },
  inputLight: { backgroundColor: '#f8fafc', color: '#0f172a' },
  saveButton: { backgroundColor: '#22d3ee', width: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scanButton: { backgroundColor: '#0284c7', borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  scanButtonText: { color: '#fff', fontWeight: '700' },
  detectedText: { color: '#16a34a', marginTop: 8, fontWeight: '600' },
  valueText: { color: '#22d3ee', fontWeight: '700', fontSize: 18 },
  slider: { width: '100%', height: 40 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleRowSpacing: { marginTop: 16 },
  toggleLabel: { fontSize: 16, fontWeight: '600' },
  switchHint: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionButton: { flex: 1, backgroundColor: '#e2e8f0', borderRadius: 12, padding: 12, alignItems: 'center' },
  optionButtonActive: { backgroundColor: '#22d3ee' },
  optionTextActive: { fontWeight: '700', color: '#042f2e' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.15)' },
  badgeText: { color: '#22c55e', fontWeight: '700', fontSize: 12 },
  devRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  devPrimaryButton: { flex: 1, borderRadius: 12, backgroundColor: '#22d3ee', paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  devPrimaryText: { color: '#001017', fontWeight: '800' },
  devSecondaryButton: { borderRadius: 12, backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  devSecondaryText: { color: '#fff', fontWeight: '700' },
  devSummaryText: { marginTop: 10, color: '#38bdf8', fontWeight: '600' },
});
