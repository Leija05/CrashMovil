import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { impactsApi, contactsApi, settingsApi, statsApi } from '../../src/services/api';
import { bluetoothTelemetryService } from '../../src/services/bluetooth';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { useCrashStore } from '../../src/store/crashStore';

const IMPACT_COOLDOWN_MS = 12000;
const SENSOR_TIMEOUT_MS = 3500;

const notify = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('CRASH Safety', message);
  }
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    settings,
    telemetry,
    batteryLevel,
    connectedDeviceName,
    isConnected,
    currentLocation,
    isEmergencyActive,
    currentImpact,
    impacts,
    user,
    setTelemetry,
    setConnected,
    setConnectedDeviceName,
    setCurrentLocation,
    setCurrentImpact,
    setEmergencyActive,
    setImpacts,
    setContacts,
    setSettings,
  } = useCrashStore();

  const isDark = settings.theme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total_impacts: 0, real_impacts: 0, false_alarms: 0 });
  const [history, setHistory] = useState<number[]>([]);
  const [sensorOffline, setSensorOffline] = useState(false);
  const [impactAlert, setImpactAlert] = useState(false);

  const lastTelemetryAt = useRef(Date.now());
  const lastImpactAt = useRef(0);
  const heroAnim = useRef(new Animated.Value(0)).current;

  const glass = isDark
    ? { borderColor: 'rgba(255,255,255,0.15)', bg: 'rgba(12,16,28,0.72)' }
    : { borderColor: 'rgba(15,23,42,0.18)', bg: 'rgba(255,255,255,0.78)' };

  const startBluetooth = useCallback(async () => {
    await bluetoothTelemetryService.startPassiveTelemetryListener(
      [settings.device_name, 'HC-05', 'HM-10'],
      (device) => {
        setConnected(Boolean(device));
        setConnectedDeviceName(device?.name ?? null);
        if (!device) {
          setSensorOffline(true);
          notify(settings.language === 'es' ? 'Sensor desconectado' : 'Sensor disconnected');
        }
      },
      (incomingTelemetry) => {
        lastTelemetryAt.current = Date.now();
        setSensorOffline(false);
        setTelemetry(incomingTelemetry);
        setHistory((prev) => [...prev.slice(-59), incomingTelemetry.g_force]);
      },
    );
  }, [setConnected, setConnectedDeviceName, setTelemetry, settings.device_name, settings.language]);

  const loadData = useCallback(async () => {
    if (!user) return;
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
  }, [setContacts, setImpacts, setSettings, user]);

  const triggerImpactFlow = useCallback(async () => {
    if (!isConnected || telemetry.g_force < settings.impact_threshold || !user) return;
    const now = Date.now();
    if (now - lastImpactAt.current < IMPACT_COOLDOWN_MS) return;
    lastImpactAt.current = now;

    setImpactAlert(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    notify(settings.language === 'es' ? 'Impacto detectado: enviando protocolo' : 'Impact detected: dispatching protocol');

    const response = await impactsApi.create({
      g_force: telemetry.g_force,
      acceleration_x: telemetry.acceleration_x,
      acceleration_y: telemetry.acceleration_y,
      acceleration_z: telemetry.acceleration_z,
      gyro_x: telemetry.gyro_x,
      gyro_y: telemetry.gyro_y,
      gyro_z: telemetry.gyro_z,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
    });

    setCurrentImpact(response.data);
    setEmergencyActive(true);
    setImpacts([response.data, ...impacts]);
  }, [currentLocation?.latitude, currentLocation?.longitude, impacts, isConnected, setCurrentImpact, setEmergencyActive, setImpacts, settings.impact_threshold, settings.language, telemetry, user]);

  useEffect(() => {
    Animated.timing(heroAnim, { toValue: 1, duration: 650, useNativeDriver: true }).start();
    startBluetooth().catch(() => undefined);
    const timer = setInterval(() => {
      const timedOut = Date.now() - lastTelemetryAt.current > SENSOR_TIMEOUT_MS;
      if (timedOut && !sensorOffline) {
        setSensorOffline(true);
        notify(settings.language === 'es' ? 'Sin telemetría en tiempo real' : 'Telemetry stream timeout');
      }
    }, 1000);

    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? Location.getCurrentPositionAsync({}) : null))
      .then((location) => {
        if (location) {
          setCurrentLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        }
      })
      .catch(() => undefined);

    if (user) loadData().catch(() => undefined);

    return () => {
      clearInterval(timer);
      bluetoothTelemetryService.stopPassiveTelemetryListener();
    };
  }, [heroAnim, loadData, sensorOffline, setCurrentLocation, settings.language, startBluetooth, user]);

  useEffect(() => {
    triggerImpactFlow().catch((error) => console.error('Impact flow error', error));
    setImpactAlert(telemetry.g_force >= settings.impact_threshold);
  }, [settings.impact_threshold, telemetry.g_force, triggerImpactFlow]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user) await loadData();
    await startBluetooth();
    setRefreshing(false);
  }, [loadData, startBluetooth, user]);

  const tone = useMemo(() => {
    if (sensorOffline) return '#f59e0b';
    if (impactAlert) return '#ef4444';
    return '#22c55e';
  }, [impactAlert, sensorOffline]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#050505' : '#F3F5FA' }]}>
      <LinearGradient colors={isDark ? ['#050505', '#06122A'] : ['#F7FAFF', '#DEE9FF']} style={StyleSheet.absoluteFill} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22d3ee" />}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View style={{ opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.hero, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}> 
            <Text style={[styles.title, { color: isDark ? '#fff' : '#031225' }]}>CRASH Safety · Ultra</Text>
            <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#475569' }]}>
              {t('linkedDevice')}: {connectedDeviceName ?? t('notConnected')}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${tone}22`, borderColor: `${tone}99` }]}>
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text style={[styles.statusText, { color: tone }]}>
                {sensorOffline ? 'Sensor timeout' : isConnected ? t('systemActive') : t('systemInactive')}
              </Text>
            </View>
          </BlurView>
        </Animated.View>

        <View style={styles.bentoGrid}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/contacts')}>
            <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.bentoCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}> 
              <Text style={[styles.cardLabel, { color: isDark ? '#cbd5e1' : '#334155' }]}>Contactos de emergencia</Text>
              <Text style={[styles.cardValue, { color: isDark ? '#fff' : '#0f172a' }]}>{stats.total_impacts}</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/profile')}>
            <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.bentoCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}> 
              <Text style={[styles.cardLabel, { color: isDark ? '#cbd5e1' : '#334155' }]}>Perfil médico</Text>
              <Text style={[styles.cardValue, { color: isDark ? '#fff' : '#0f172a' }]}>{user ? 'Activo' : 'Pendiente'}</Text>
            </BlurView>
          </TouchableOpacity>

          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.bentoCard, styles.fullCard, { borderColor: impactAlert ? '#ef4444' : glass.borderColor, backgroundColor: glass.bg }]}> 
            <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#0f172a' }]}>Telemetría en tiempo real</Text>
            <View style={styles.telemetryRow}>
              <View style={styles.metric}><Text style={styles.metricLabel}>GX</Text><Text style={styles.metricValue}>{telemetry.gyro_x.toFixed(0)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>GY</Text><Text style={styles.metricValue}>{telemetry.gyro_y.toFixed(0)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>GZ</Text><Text style={styles.metricValue}>{telemetry.gyro_z.toFixed(0)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>|G|</Text><Text style={[styles.metricValue, { color: impactAlert ? '#ef4444' : '#22d3ee' }]}>{telemetry.g_force.toFixed(2)}</Text></View>
            </View>
            {history.length > 5 && (
              <TelemetryChart
                data={history.map((value) => ({ value }))}
                title="magnitudG"
                color={impactAlert ? '#ef4444' : '#22d3ee'}
                maxValue={Math.max(3, settings.impact_threshold + 3)}
              />
            )}
          </BlurView>
        </View>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.footerCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}>
          <Text style={[styles.cardLabel, { color: isDark ? '#cbd5e1' : '#334155' }]}>
            Batería {batteryLevel}% · GPS {currentLocation ? 'OK' : '--'}
          </Text>
        </BlurView>
      </ScrollView>
      <EmergencyModal visible={isEmergencyActive} impact={currentImpact} onClose={() => setEmergencyActive(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 100, gap: 12 },
  hero: { borderRadius: 22, borderWidth: 1, padding: 18, overflow: 'hidden' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { marginTop: 8, fontSize: 14, fontWeight: '500' },
  statusPill: { marginTop: 14, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 999, marginRight: 8 },
  statusText: { fontWeight: '800' },
  bentoGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoCard: { width: '48%', minHeight: 122, borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  fullCard: { width: '100%', minHeight: 260 },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  cardValue: { marginTop: 10, fontSize: 24, fontWeight: '900' },
  sectionTitle: { fontSize: 24, fontWeight: '900', marginBottom: 12 },
  telemetryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metric: { flex: 1, minWidth: '23%', backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  metricLabel: { color: '#94a3b8', fontWeight: '700', textAlign: 'center' },
  metricValue: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center', marginTop: 4 },
  footerCard: { marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
});
