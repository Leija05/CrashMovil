import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import { useCrashStore } from '../../src/store/crashStore';
import { settingsApi } from '../../src/services/api';
import i18n from '../../src/i18n';
import {
  bluetoothTelemetryService,
  bluetoothDeviceNameMatcher,
  isBluetoothLeAvailable,
} from '../../src/services/bluetooth';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const {
    settings,
    updateSettings,
    setConnected,
    setConnectedDeviceName,
    user,
  } = useCrashStore();

  const isDark = settings.theme === 'dark';
  const [deviceName, setDeviceName] = useState(settings.device_name);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedName, setDetectedName] = useState<string | null>(null);

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

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{t('deviceSettings')}</Text>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('deviceName')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="HM-10"
              placeholderTextColor="#888"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleDeviceNameSave}>
              <Ionicons name="checkmark" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
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
                : (settings.language === 'es' ? 'Buscar módulo BLE' : 'Detect paired module')}
            </Text>
          </TouchableOpacity>
          {!!detectedName && (
            <Text style={styles.detectedText}>
              {settings.language === 'es' ? 'Detectado:' : 'Detected:'} {detectedName}
            </Text>
          )}
        </View>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
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
            maximumTrackTintColor="#333"
            thumbTintColor="#00d9ff"
          />
        </View>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>{t('autoCall')}</Text>
            <Switch
              value={settings.auto_call_enabled}
              onValueChange={(value) => handleUpdateSettings({ auto_call_enabled: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>{t('smsAlert')}</Text>
            <Switch
              value={settings.sms_enabled}
              onValueChange={(value) => handleUpdateSettings({ sms_enabled: value })}
            />
          </View>
        </View>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('language')}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={styles.optionButton} onPress={() => handleLanguageChange('es')}><Text>Español</Text></TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} onPress={() => handleLanguageChange('en')}><Text>English</Text></TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('theme')}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={styles.optionButton} onPress={() => handleThemeChange('dark')}><Text>{t('dark')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} onPress={() => handleThemeChange('light')}><Text>{t('light')}</Text></TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#0c0c0c' },
  containerLight: { backgroundColor: '#f0f4f8' },
  scrollContent: { padding: 20, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  textDark: { color: '#fff' },
  textLight: { color: '#111' },
  section: { borderRadius: 12, padding: 15, marginBottom: 14 },
  sectionDark: { backgroundColor: 'rgba(255,255,255,0.05)' },
  sectionLight: { backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  sectionSubtitle: { color: '#6b7280', marginBottom: 10, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  inputDark: { backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' },
  inputLight: { backgroundColor: '#f3f4f6', color: '#111' },
  saveButton: { backgroundColor: '#00d9ff', width: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scanButton: { backgroundColor: '#0ea5e9', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  scanButtonText: { color: '#fff', fontWeight: '600' },
  detectedText: { color: '#16a34a', marginTop: 8, fontWeight: '600' },
  valueText: { color: '#00d9ff', fontWeight: '700' },
  slider: { width: '100%', height: 40 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { fontSize: 16 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionButton: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 10, padding: 12, alignItems: 'center' },
});
