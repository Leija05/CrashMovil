import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useCrashStore } from '../../src/store/crashStore';
import { impactsApi, contactsApi, settingsApi, statsApi } from '../../src/services/api';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { CrashLogo } from '../../src/components/CrashLogo';
import { bluetoothTelemetryService } from '../../src/services/bluetooth';

const IMPACT_COOLDOWN_MS = 12000;

export default function HomeScreen() {
  const { t } = useTranslation();
  const {
    isConnected,
    connectedDeviceName,
    batteryLevel,
    settings,
    telemetry,
    setTelemetry,
    setCurrentLocation,
    currentLocation,
    isEmergencyActive,
    setEmergencyActive,
    setCurrentImpact,
    currentImpact,
    impacts,
    setImpacts,
    setContacts,
    setSettings,
    setConnected,
    setConnectedDeviceName,
    user,
  } = useCrashStore();

  const isDark = settings.theme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total_impacts: 0, real_impacts: 0, false_alarms: 0 });
  const [telemetryHistory, setTelemetryHistory] = useState<{ g: number[] }>({ g: [] });

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const lastImpactAt = useRef(0);

  const createImpactFromTelemetry = useCallback(async () => {
    if (!isConnected) return;
    if (telemetry.g_force < settings.impact_threshold) return;

    const now = Date.now();
    if (now - lastImpactAt.current < IMPACT_COOLDOWN_MS) return;
    lastImpactAt.current = now;

    const impactData = {
      g_force: telemetry.g_force,
      acceleration_x: telemetry.acceleration_x,
      acceleration_y: telemetry.acceleration_y,
      acceleration_z: telemetry.acceleration_z,
      gyro_x: telemetry.gyro_x,
      gyro_y: telemetry.gyro_y,
      gyro_z: telemetry.gyro_z,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
    };

    if (!user) {
      Alert.alert(
        settings.language === 'es' ? 'Sesión requerida' : 'Session required',
        settings.language === 'es'
          ? 'Debes iniciar sesión para registrar impactos reales en el backend.'
          : 'You must sign in to store real impacts in the backend.'
      );
      return;
    }

    try {
      const response = await impactsApi.create(impactData);
      const impact = response.data;
      setCurrentImpact(impact);
      setEmergencyActive(true);
      setImpacts([impact, ...impacts]);
    } catch (error) {
      console.error('Error creating impact:', error);
      Alert.alert(
        settings.language === 'es' ? 'Error registrando impacto' : 'Impact registration error',
        settings.language === 'es'
          ? 'No se pudo registrar el impacto recibido del módulo Bluetooth.'
          : 'Could not register impact received from Bluetooth module.'
      );
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, impacts, isConnected, setCurrentImpact, setEmergencyActive, setImpacts, settings.impact_threshold, settings.language, telemetry, user]);

  useEffect(() => {
    createImpactFromTelemetry();
  }, [createImpactFromTelemetry]);

  const startEntranceAnimations = useCallback(() => {
    Animated.parallel([
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 1000,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, titleAnim]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [contactsRes, impactsRes, settingsRes, statsRes] = await Promise.all([
        contactsApi.getAll(),
        impactsApi.getAll(),
        settingsApi.get(),
        statsApi.get(),
      ]);
      setContacts(contactsRes.data);
      setImpacts(impactsRes.data);
      setSettings(settingsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, [setContacts, setImpacts, setSettings, user]);

  const requestLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Location error:', error);
    }
  }, [setCurrentLocation]);

  const startPassiveBluetooth = useCallback(async () => {
    try {
      await bluetoothTelemetryService.startPassiveTelemetryListener(
        [settings.device_name, 'HC-05', 'HC-10'],
        (device) => {
          setConnected(Boolean(device));
          setConnectedDeviceName(device?.name ?? null);
        },
        (incomingTelemetry) => {
          setTelemetry(incomingTelemetry);
          setTelemetryHistory((prev) => ({
            g: [...prev.g.slice(-29), incomingTelemetry.g_force],
          }));
        }
      );
    } catch (error) {
      console.error('Bluetooth passive listener error:', error);
      setConnected(false);
      setConnectedDeviceName(null);
    }
  }, [setConnected, setConnectedDeviceName, setTelemetry, settings.device_name]);

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setContacts([]);
      setImpacts([]);
      setStats({ total_impacts: 0, real_impacts: 0, false_alarms: 0 });
    }

    requestLocationPermission();
    startEntranceAnimations();
    startPassiveBluetooth();

    return () => {
      bluetoothTelemetryService.stopPassiveTelemetryListener();
    };
  }, [loadData, requestLocationPermission, setContacts, setImpacts, startEntranceAnimations, startPassiveBluetooth, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user) {
      await loadData();
    }
    await startPassiveBluetooth();
    setRefreshing(false);
  }, [loadData, startPassiveBluetooth, user]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return '#22c55e';
      case 'medium': return '#f59e0b';
      case 'high': return '#ef4444';
      case 'critical': return '#dc2626';
      default: return '#dc2626';
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View style={[styles.header, { opacity: titleAnim }]}> 
          <View style={styles.logoContainer}>
            <CrashLogo size={38} color="#dc2626" animated={true} />
            <View style={styles.titleContainer}>
              <Text style={[styles.logo, isDark ? styles.textDark : styles.textLight]}>C.R.A.S.H.</Text>
              <Text style={[styles.tagline, isDark ? styles.taglineDark : styles.taglineLight]}>
                Collision Response and Safety Hardware
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.statusCard, { opacity: cardAnim }]}> 
          <Text style={[styles.statusTitle, isDark ? styles.textDark : styles.textLight]}>
            {isConnected ? t('systemActive') : t('systemInactive')}
          </Text>
          <Text style={[styles.statusSubtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            {t('linkedDevice')}: {connectedDeviceName ?? t('notConnected')}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.statText, isDark ? styles.textDark : styles.textLight]}>{t('battery')}: {batteryLevel}%</Text>
            <Text style={[styles.statText, isDark ? styles.textDark : styles.textLight]}>{t('records')}: {stats.real_impacts}</Text>
            <Text style={[styles.statText, isDark ? styles.textDark : styles.textLight]}>{t('location')}: {currentLocation ? 'GPS' : '--'}</Text>
          </View>
        </Animated.View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('realTimeTelemetry')}</Text>
          <Text style={[styles.telemetryText, isDark ? styles.textDark : styles.textLight]}>
            X: {telemetry.acceleration_x.toFixed(2)} | Y: {telemetry.acceleration_y.toFixed(2)} | Z: {telemetry.acceleration_z.toFixed(2)}
          </Text>
          <Text style={styles.gForceText}>G: {telemetry.g_force.toFixed(2)}</Text>
          {telemetryHistory.g.length > 5 && (
            <TelemetryChart
              data={telemetryHistory.g.map((value) => ({ value }))}
              title="G-Force"
              color="#dc2626"
              maxValue={Math.max(3, settings.impact_threshold + 3)}
            />
          )}
        </View>

        {impacts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Últimos impactos reales' : 'Recent real impacts'}
            </Text>
            {impacts.slice(0, 3).map((impact) => (
              <View key={impact.id} style={[styles.impactItem, { borderLeftColor: getSeverityColor(impact.severity) }]}>
                <Text style={[styles.impactG, isDark ? styles.textDark : styles.textLight]}>{impact.g_force.toFixed(1)}G</Text>
                <Text style={{ color: getSeverityColor(impact.severity), fontWeight: '700' }}>{t(impact.severity).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <EmergencyModal
        visible={isEmergencyActive}
        onClose={() => setEmergencyActive(false)}
        impact={currentImpact}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#0c0c0c' },
  containerLight: { backgroundColor: '#f0f4f8' },
  scrollContent: { padding: 20, paddingBottom: 90 },
  header: { marginBottom: 16 },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleContainer: { flex: 1 },
  logo: { fontSize: 26, fontWeight: '800' },
  tagline: { fontSize: 11 },
  taglineDark: { color: '#9ca3af' },
  taglineLight: { color: '#4b5563' },
  statusCard: { borderRadius: 12, padding: 16, backgroundColor: 'rgba(220,38,38,0.12)', marginBottom: 16 },
  statusTitle: { fontSize: 20, fontWeight: '700' },
  statusSubtitle: { marginTop: 6, marginBottom: 10 },
  subtitleDark: { color: '#d1d5db' },
  subtitleLight: { color: '#374151' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  statText: { fontSize: 12, fontWeight: '600' },
  section: { borderRadius: 12, padding: 16, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  telemetryText: { fontSize: 14, marginBottom: 6 },
  gForceText: { fontSize: 22, fontWeight: '800', color: '#dc2626', marginBottom: 10 },
  impactItem: { borderLeftWidth: 4, paddingLeft: 10, marginBottom: 8 },
  impactG: { fontSize: 16, fontWeight: '700' },
  textDark: { color: '#fff' },
  textLight: { color: '#111827' },
});
