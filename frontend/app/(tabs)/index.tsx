import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  Easing,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useCrashStore } from '../../src/store/crashStore';
import { impactsApi, contactsApi, settingsApi, statsApi } from '../../src/services/api';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { CrashLogo } from '../../src/components/CrashLogo';
import { bluetoothTelemetryService } from '../../src/services/bluetooth';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const {
    isConnected,
    connectedDeviceName,
    batteryLevel,
    settings,
    telemetry,
    setTelemetry,
    currentLocation,
    isEmergencyActive,
    setEmergencyActive,
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
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [stats, setStats] = useState({ total_impacts: 0, real_impacts: 0, false_alarms: 0 });
  
  // Estado único para la gráfica
  const [telemetryHistory, setTelemetryHistory] = useState<{ g: number[] }>({ g: [] });

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoadingData(true);
    try {
      const [c, i, s, st] = await Promise.allSettled([
        contactsApi.getAll(),
        impactsApi.getAll(),
        settingsApi.get(),
        statsApi.get()
      ]);
      if (c.status === 'fulfilled') setContacts(c.value.data);
      if (i.status === 'fulfilled') setImpacts(i.value.data);
      if (s.status === 'fulfilled') setSettings(s.value.data);
      if (st.status === 'fulfilled') setStats(st.value.data);
    } catch (error) {
      console.log('Error API');
    } finally {
      setIsLoadingData(false);
    }
  }, [setContacts, setImpacts, setSettings, user]);

  const handleViewDiagnosis = (impact: any) => {
    if (!impact) return;
    router.push({
      pathname: '/diagnosis',
      params: { 
        impactId: impact.id, 
        gForce: (impact.g_force ?? 0).toString(),
        severity: impact.severity || 'low' 
      },
    });
  };

  const startPassiveBluetooth = useCallback(async () => {
    try {
      await bluetoothTelemetryService.startPassiveTelemetryListener(
        [settings.device_name, 'HC-05', 'HM-10'],
        (device) => {
          setConnected(Boolean(device));
          setConnectedDeviceName(device?.name ?? null);
        },
        (incomingTelemetry) => {
          setTelemetry(incomingTelemetry);
          setTelemetryHistory((prev) => ({
            g: [...prev.g.slice(-39), incomingTelemetry.g_force],
          }));
        }
      );
    } catch (error) {
      console.log('Bluetooth error');
    }
  }, [setConnected, setConnectedDeviceName, setTelemetry, settings.device_name]);

  useEffect(() => {
    if (user) loadData();
    
    Animated.parallel([
      Animated.timing(titleAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(cardAnim, { toValue: 1, duration: 950, delay: 120, useNativeDriver: true }),
    ]).start();

    startPassiveBluetooth();
    return () => bluetoothTelemetryService.stopPassiveTelemetryListener();
  }, [user, loadData, startPassiveBluetooth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HERO CARD */}
        <Animated.View style={[styles.heroCard, isDark ? styles.heroCardDark : styles.heroCardLight, { opacity: titleAnim }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.logoContainer}>
              <CrashLogo size={42} color="#ef4444" animated={true} />
              <View>
                <Text style={[styles.logo, isDark ? styles.textDark : styles.textLight]}>C.R.A.S.H.</Text>
                <Text style={[styles.tagline, isDark ? styles.subtitleDark : styles.subtitleLight]}>Collision Response Alert System</Text>
              </View>
            </View>
          </View>
          
          <View style={[styles.statusPill, isConnected ? styles.statusPillOnline : styles.statusPillOffline]}>
            <View style={[styles.statusDot, isConnected ? styles.statusDotOnline : styles.statusDotOffline]} />
            <Text style={styles.statusPillText}>{isConnected ? t('systemActive') : t('systemInactive')}</Text>
            <View style={styles.statusDivider} />
            <Ionicons name="logo-whatsapp" size={14} color="#22c55e" />
            <Text style={styles.statusPillText}>Ready</Text>
          </View>
          
          <Text style={[styles.heroDeviceText, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            {t('linkedDevice')}: {connectedDeviceName ?? t('notConnected')}
          </Text>
        </Animated.View>

        {/* QUICK STATS GRID */}
        <Animated.View style={[styles.quickStatsGrid, { opacity: cardAnim }]}>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('battery')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{batteryLevel}%</Text>
          </View>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('records')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{stats?.real_impacts ?? 0}</Text>
          </View>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('location')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{currentLocation ? 'GPS' : '--'}</Text>
          </View>
        </Animated.View>

        {/* TELEMETRY HUD (X, Y, Z + G-FORCE) */}
        <View style={[styles.section, isDark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('realTimeTelemetry')}</Text>
          <View style={styles.telemetryPillsRow}>
            <View style={styles.telemetryPill}>
              <Text style={styles.telemetryPillLabel}>X</Text>
              <Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{(telemetry?.acceleration_x ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.telemetryPill}>
              <Text style={styles.telemetryPillLabel}>Y</Text>
              <Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{(telemetry?.acceleration_y ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.telemetryPill}>
              <Text style={styles.telemetryPillLabel}>Z</Text>
              <Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{(telemetry?.acceleration_z ?? 0).toFixed(2)}</Text>
            </View>
          </View>

          <Text style={styles.gForceText}>{telemetry.g_force.toFixed(2)} G</Text>
          
          {telemetryHistory.g.length > 2 && (
            <TelemetryChart
              data={telemetryHistory.g.map((v) => ({ value: v }))}
              title="G-Force"
              color="#ef4444"
              maxValue={10}
            />
          )}
        </View>

        {/* RECENT IMPACTS */}
        <View style={[styles.section, isDark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('recentImpacts')}</Text>
          {impacts.length === 0 ? (
            <Text style={{ color: '#94a3b8', textAlign: 'center' }}>No hay registros.</Text>
          ) : (
            impacts.slice(0, 3).map((impact) => (
              <TouchableOpacity key={impact.id} style={styles.impactItem} onPress={() => handleViewDiagnosis(impact)}>
                <View>
                  <Text style={[styles.impactG, isDark ? styles.textDark : styles.textLight]}>{(impact.g_force ?? 0).toFixed(1)}G</Text>
                  <Text style={styles.impactMeta}>{new Date(impact.timestamp).toLocaleTimeString()}</Text>
                </View>
                <Ionicons name="medkit" size={20} color="#00d9ff" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <EmergencyModal visible={isEmergencyActive} onClose={() => setEmergencyActive(false)} impact={currentImpact} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#020617' },
  containerLight: { backgroundColor: '#e2e8f0' },
  scrollContent: { padding: 18, paddingBottom: 96 },
  heroCard: { borderRadius: 24, padding: 20, marginBottom: 14 },
  heroCardDark: { backgroundColor: '#0f172a' },
  heroCardLight: { backgroundColor: '#ffffff' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logo: { fontSize: 34, fontWeight: '900', letterSpacing: 1 },
  tagline: { fontSize: 11, marginTop: 2 },
  textDark: { color: '#f8fafc' },
  textLight: { color: '#0f172a' },
  subtitleDark: { color: '#94a3b8' },
  subtitleLight: { color: '#475569' },
  statusPill: { marginTop: 15, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(30,41,59,0.5)' },
  statusPillOnline: { backgroundColor: 'rgba(34,197,94,0.15)' },
  statusPillOffline: { backgroundColor: 'rgba(239,68,68,0.15)' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotOnline: { backgroundColor: '#22c55e' },
  statusDotOffline: { backgroundColor: '#ef4444' },
  statusPillText: { color: '#f8fafc', fontWeight: '700', fontSize: 12 },
  statusDivider: { width: 1, height: 12, backgroundColor: '#475569', marginHorizontal: 4 },
  heroDeviceText: { marginTop: 10, fontWeight: '600', fontSize: 12 },
  quickStatsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickStatCard: { flex: 1, borderRadius: 16, padding: 12, borderWidth: 1 },
  cardDark: { backgroundColor: '#0f172a', borderColor: '#1e293b' },
  cardLight: { backgroundColor: '#fff', borderColor: '#dbeafe' },
  quickStatLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4, fontWeight: '600' },
  quickStatValue: { fontSize: 24, fontWeight: '900' },
  section: { borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 15 },
  telemetryPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  telemetryPill: { flex: 1, backgroundColor: 'rgba(148,163,184,0.1)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  telemetryPillLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 10 },
  telemetryPillValue: { fontSize: 17, fontWeight: '900' },
  gForceText: { color: '#ef4444', fontSize: 50, fontWeight: '900', textAlign: 'center', marginVertical: 10 },
  impactItem: { backgroundColor: 'rgba(30,41,59,0.3)', padding: 12, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  impactG: { fontSize: 22, fontWeight: '900' },
  impactMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
});