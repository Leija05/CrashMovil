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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { contactsApi, impactsApi, settingsApi, statsApi } from '../../src/services/api';
import { bluetoothTelemetryService } from '../../src/services/bluetooth';
import { CrashLogo } from '../../src/components/CrashLogo';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { useCrashStore } from '../../src/store/crashStore';

const IMPACT_COOLDOWN_MS = 12000;
const HEARTBEAT_TIMEOUT_MS = 7000;
const HIGH_FORCE_ALERT_COOLDOWN_MS = 8000;

const notify = (message: string) => {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert('CRASH Safety', message);
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
    contacts,
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

  const lastSignalAt = useRef(Date.now());
  const lastImpactAt = useRef(0);
  const lastHighForceAlertAt = useRef(0);
  const heroAnim = useRef(new Animated.Value(0)).current;

  // NUEVO: Refs para evitar cierres (closures) obsoletos en el listener de alta frecuencia
  const telemetryRef = useRef(telemetry);
  const settingsRef = useRef(settings);
  const isConnectedRef = useRef(isConnected);
  const connectedDeviceNameRef = useRef(connectedDeviceName);
  const sensorOfflineRef = useRef(sensorOffline);

  // Sincronizamos los refs cada vez que el estado cambia
  useEffect(() => {
    telemetryRef.current = telemetry;
    settingsRef.current = settings;
    isConnectedRef.current = isConnected;
    connectedDeviceNameRef.current = connectedDeviceName;
    sensorOfflineRef.current = sensorOffline;
  }, [connectedDeviceName, isConnected, sensorOffline, telemetry, settings]);

  const glass = isDark
    ? { borderColor: '#1f3356', bg: 'rgba(10,24,51,0.86)' }
    : { borderColor: 'rgba(15,23,42,0.16)', bg: 'rgba(255,255,255,0.82)' };

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

  useFocusEffect(
    useCallback(() => {
      if (user) loadData().catch(() => undefined);
    }, [loadData, user]),
  );

  const startBluetooth = useCallback(async () => {
    // Usamos las propiedades de los refs para que el listener siempre tenga data fresca
    await bluetoothTelemetryService.startPassiveTelemetryListener(
      [settingsRef.current.device_name, 'HC-05', 'HM-10'],
      (device) => {
        const connected = Boolean(device);
        setConnected(connected);
        setConnectedDeviceName(device?.name ?? null);
        if (!connected) {
          setSensorOffline(true);
          notify(settingsRef.current.language === 'es' ? 'Sensor desconectado' : 'Sensor disconnected');
        } else {
          setSensorOffline(false);
          notify(
            settingsRef.current.language === 'es'
              ? `Módulo conectado: ${device?.name ?? 'Bluetooth'}`
              : `Module connected: ${device?.name ?? 'Bluetooth'}`,
          );
        }
      },
      (incomingTelemetry) => {
        lastSignalAt.current = Date.now();
        setSensorOffline(false);
        setTelemetry(incomingTelemetry);
        setHistory((prev) => [...prev.slice(-59), incomingTelemetry.g_force]);
      },
      {
        onHeartbeat: () => {
          lastSignalAt.current = Date.now();
          setSensorOffline(false);
        },
        onCrashSignal: (gForce) => {
          if (!Number.isFinite(gForce ?? Number.NaN)) return;
          const safeForce = gForce as number;
          const currentTelemetry = telemetryRef.current;
          const crashTelemetry = { ...currentTelemetry, g_force: safeForce };
          setTelemetry(crashTelemetry);
          setHistory((prev) => [...prev.slice(-59), safeForce]);
        },
      }
    );
  }, [setConnected, setConnectedDeviceName, setTelemetry]);

  const triggerImpactFlow = useCallback(async () => {
    // Acceso mediante refs para garantizar tiempo real extremo
    const currentT = telemetryRef.current;
    const currentS = settingsRef.current;

    if (!isConnected || currentT.g_force < currentS.impact_threshold || !user) return;
    const now = Date.now();
    if (now - lastImpactAt.current < IMPACT_COOLDOWN_MS) return;
    lastImpactAt.current = now;

    setImpactAlert(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);

    const severity =
      currentT.g_force < 5 ? 'low' : currentT.g_force < 10 ? 'medium' : currentT.g_force < 15 ? 'high' : 'critical';
    setCurrentImpact({
      id: `pending-${now}`,
      timestamp: new Date(now).toISOString(),
      g_force: currentT.g_force,
      acceleration_x: currentT.acceleration_x,
      acceleration_y: currentT.acceleration_y,
      acceleration_z: currentT.acceleration_z,
      gyro_x: currentT.gyro_x,
      gyro_y: currentT.gyro_y,
      gyro_z: currentT.gyro_z,
      severity,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
      was_false_alarm: false,
      alerts_dispatched: 0,
    });
    setEmergencyActive(true);
  }, [currentLocation?.latitude, currentLocation?.longitude, isConnected, setCurrentImpact, setEmergencyActive, user]);

  useEffect(() => {
    Animated.timing(heroAnim, { toValue: 1, duration: 550, useNativeDriver: true }).start();
    startBluetooth().catch(() => undefined);

    const timer = setInterval(() => {
      const now = Date.now();
      // Heartbeat timeout de 7s para detectar desconexión silenciosa del casco.
      const timedOut = now - lastSignalAt.current > HEARTBEAT_TIMEOUT_MS;

      if (timedOut && !sensorOfflineRef.current) {
        setSensorOffline(true);
        // Solo notificamos si realmente hay una conexión activa pero sin datos
        if (isConnectedRef.current && connectedDeviceNameRef.current) {
          notify(settingsRef.current.language === 'es' ? 'Buscando datos del sensor...' : 'Waiting for sensor data...');
        }
      }
    }, 2000); // Verificamos cada 2 segundos para no saturar el hilo principal

    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? Location.getCurrentPositionAsync({}) : null))
      .then((location) => {
        if (location) {
          setCurrentLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        }
      })
      .catch(() => undefined);

    return () => {
      clearInterval(timer);
    };
  }, [heroAnim, setCurrentLocation, startBluetooth]);

  useEffect(() => {
    triggerImpactFlow().catch(() => undefined);
    setImpactAlert(telemetry.g_force >= settings.impact_threshold);
  }, [settings.impact_threshold, telemetry.g_force, triggerImpactFlow]);

  useEffect(() => {
    const crossedHighForce = telemetry.g_force >= settings.impact_threshold;
    if (!crossedHighForce) return;
    const now = Date.now();
    if (now - lastHighForceAlertAt.current < HIGH_FORCE_ALERT_COOLDOWN_MS) return;
    lastHighForceAlertAt.current = now;
    notify(
      settings.language === 'es'
        ? `⚠️ Fuerza alta detectada (${telemetry.g_force.toFixed(1)}G)`
        : `⚠️ High force detected (${telemetry.g_force.toFixed(1)}G)`,
    );
  }, [settings.impact_threshold, settings.language, telemetry.g_force]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user) await loadData();
    await startBluetooth();
    setRefreshing(false);
  }, [loadData, startBluetooth, user]);

  const statusTone = useMemo(() => {
    if (impactAlert) return '#ff4b4b';
    if (isConnected && !sensorOffline) return '#22c55e';
    return '#ef4444';
  }, [impactAlert, isConnected, sensorOffline]);

  const batteryTone = batteryLevel > 60 ? '#22c55e' : batteryLevel > 30 ? '#f59e0b' : '#ef4444';
  const chartPoints = useMemo(() => history.map((value) => ({ value })), [history]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#02071E' : '#EFF3FB' }]}>
      <LinearGradient colors={isDark ? ['#02071E', '#020B2C', '#02071E'] : ['#F8FBFF', '#EAF2FF']} style={StyleSheet.absoluteFill} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View style={{ opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.heroCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}>
            <View style={styles.heroHeader}>
              <CrashLogo size={42} color="#ef4444" animated={true} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.brand, { color: isDark ? '#fff' : '#0f172a' }]}>C.R.A.S.H.</Text>
                <Text style={[styles.heroSubtitle, { color: isDark ? '#94a3b8' : '#475569' }]}>Collision Response and Safety Hardware</Text>
              </View>
            </View>

            <View style={[styles.statusPill, { borderColor: `${statusTone}77`, backgroundColor: `${statusTone}22` }]}>
              <View style={[styles.dot, { backgroundColor: statusTone }]} />
              <Text style={[styles.statusText, { color: statusTone }]}>{isConnected && !sensorOffline ? t('systemActive') : t('systemInactive')}</Text>
              <Text style={styles.statusDivider}>|</Text>
              <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
              <Text style={styles.statusChannel}>WhatsApp</Text>
            </View>

            <Text style={[styles.linkedText, { color: isDark ? '#94a3b8' : '#334155' }]}>
              {t('linkedDevice')}: {connectedDeviceName ?? t('notConnected')}
            </Text>
          </BlurView>
        </Animated.View>

        <View style={styles.statsRow}>
          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.statCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}>
            <Text style={styles.statLabel}>Batería</Text>
            <View style={styles.batteryHeader}>
              <Ionicons name="battery-half" size={18} color={batteryTone} />
              <Text style={[styles.statValue, { color: isDark ? '#fff' : '#0f172a' }]}>{batteryLevel}%</Text>
            </View>
            <View style={styles.batteryTrack}>
              <View style={[styles.batteryFill, { width: `${Math.min(100, Math.max(0, batteryLevel))}%`, backgroundColor: batteryTone }]} />
            </View>
          </BlurView>

          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.statCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}>
            <Text style={styles.statLabel}>Registros</Text>
            <Text style={[styles.statValue, { color: isDark ? '#fff' : '#0f172a' }]}>{stats.real_impacts}</Text>
            <Text style={styles.statHint}>Contactos: {contacts.length}</Text>
          </BlurView>

          <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.statCard, { borderColor: glass.borderColor, backgroundColor: glass.bg }]}>
            <Text style={styles.statLabel}>Ubicación</Text>
            <Text style={[styles.statValue, { color: isDark ? '#fff' : '#0f172a' }]}>{currentLocation ? 'GPS' : '--'}</Text>
            <Text style={styles.statHint}>{currentLocation ? 'Disponible' : 'Sin señal'}</Text>
          </BlurView>
        </View>

        <BlurView intensity={15} tint={isDark ? 'dark' : 'light'} style={[styles.telemetryCard, { borderColor: impactAlert ? '#ef4444' : glass.borderColor, backgroundColor: glass.bg }]}>
          <Text style={[styles.telemetryTitle, { color: isDark ? '#fff' : '#0f172a' }]}>Telemetría en Tiempo Real</Text>

          <View style={styles.xyzRow}>
            <View style={styles.xyzCard}><Text style={styles.xyzLabel}>X</Text><Text style={styles.xyzValue}>{telemetry.acceleration_x.toFixed(2)}</Text></View>
            <View style={styles.xyzCard}><Text style={styles.xyzLabel}>Y</Text><Text style={styles.xyzValue}>{telemetry.acceleration_y.toFixed(2)}</Text></View>
            <View style={styles.xyzCard}><Text style={styles.xyzLabel}>Z</Text><Text style={styles.xyzValue}>{telemetry.acceleration_z.toFixed(2)}</Text></View>
          </View>

          <Text style={[styles.gValue, { color: impactAlert ? '#ff4b4b' : '#ff5e5e' }]}>{telemetry.g_force.toFixed(2)} G</Text>

          <View style={styles.chartShell}>
            <TelemetryChart
              data={chartPoints}
              title="G-Force"
              color={impactAlert ? '#ff4b4b' : '#ff5e5e'}
              maxValue={Math.max(3, settings.impact_threshold + 3)}
              threshold={settings.impact_threshold}
              unit="G"
            />
          </View>
        </BlurView>

        <TouchableOpacity style={styles.contactShortcut} onPress={() => router.push('/contacts')} activeOpacity={0.85}>
          <Ionicons name="people" size={16} color="#22d3ee" />
          <Text style={styles.contactShortcutText}>Contactos de emergencia: {contacts.length}</Text>
        </TouchableOpacity>
      </ScrollView>

      <EmergencyModal visible={isEmergencyActive} impact={currentImpact} onClose={() => setEmergencyActive(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 100, gap: 12 },
  heroCard: { borderRadius: 22, borderWidth: 1, padding: 16, overflow: 'hidden' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  heroSubtitle: { fontSize: 15, fontWeight: '500', marginTop: -6 },
  statusPill: { marginTop: 14, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  dot: { width: 11, height: 11, borderRadius: 999 },
  statusText: { fontWeight: '800', fontSize: 16 },
  statusDivider: { color: '#64748b', marginHorizontal: 2 },
  statusChannel: { color: '#22c55e', fontWeight: '800' },
  linkedText: { marginTop: 12, fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  statLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  statValue: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  statHint: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  batteryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  batteryTrack: { marginTop: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.3)', overflow: 'hidden' },
  batteryFill: { height: '100%', borderRadius: 999 },
  telemetryCard: { borderRadius: 22, borderWidth: 1, padding: 14 },
  telemetryTitle: { fontSize: 24, fontWeight: '900', marginBottom: 12 },
  xyzRow: { flexDirection: 'row', gap: 10 },
  xyzCard: { flex: 1, borderRadius: 16, backgroundColor: 'rgba(30,41,59,0.72)', paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(148,163,184,0.2)' },
  xyzLabel: { color: '#94a3b8', fontWeight: '700', textAlign: 'center', fontSize: 15 },
  xyzValue: { color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 22, marginTop: 4 },
  gValue: { fontSize: 56, fontWeight: '900', textAlign: 'center', marginVertical: 14 },
  chartShell: { backgroundColor: 'rgba(30,41,59,0.75)', borderRadius: 20, padding: 10 },
  contactShortcut: { marginTop: 2, borderRadius: 14, borderWidth: 1, borderColor: '#1f3356', paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(4,18,40,0.7)' },
  contactShortcutText: { color: '#cbd5e1', fontWeight: '700' },
});
