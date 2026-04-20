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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore } from '../../src/store/crashStore';
import { impactsApi, contactsApi, settingsApi, statsApi } from '../../src/services/api';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { CrashLogo } from '../../src/components/CrashLogo';
import { bluetoothTelemetryService } from '../../src/services/bluetooth';
import { buildSafetyInsight } from '../../src/utils/safetyInsights';

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
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 950,
        delay: 120,
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

  const insight = buildSafetyInsight(telemetry, impacts, settings.impact_threshold);
  const insightColor =
    insight.level === 'stable' ? '#22c55e' : insight.level === 'caution' ? '#f59e0b' : '#ef4444';

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View
          style={[
            styles.heroCard,
            isDark ? styles.heroCardDark : styles.heroCardLight,
            { opacity: titleAnim, transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.logoContainer}>
              <CrashLogo size={42} color="#ef4444" animated={true} />
              <View>
                <Text style={[styles.logo, isDark ? styles.textDark : styles.textLight]}>C.R.A.S.H.</Text>
                <Text style={[styles.tagline, isDark ? styles.subtitleDark : styles.subtitleLight]}>
                  Collision Response and Safety Hardware
                </Text>
              </View>
            </View>
            <View style={[styles.channelPill, isDark ? styles.channelPillDark : styles.channelPillLight]}>
              <Ionicons name="logo-whatsapp" size={14} color="#22c55e" />
              <Text style={styles.channelPillText}>WhatsApp</Text>
            </View>
          </View>

          <View style={[styles.statusPill, isConnected ? styles.statusPillOnline : styles.statusPillOffline]}>
            <View style={[styles.statusDot, isConnected ? styles.statusDotOnline : styles.statusDotOffline]} />
            <Text style={styles.statusPillText}>{isConnected ? t('systemActive') : t('systemInactive')}</Text>
          </View>
          <Text style={[styles.heroDeviceText, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            {t('linkedDevice')}: {connectedDeviceName ?? t('notConnected')}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.quickStatsGrid, { opacity: cardAnim }]}>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('battery')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{batteryLevel}%</Text>
          </View>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('records')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{stats.real_impacts}</Text>
          </View>
          <View style={[styles.quickStatCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.quickStatLabel}>{t('location')}</Text>
            <Text style={[styles.quickStatValue, isDark ? styles.textDark : styles.textLight]}>{currentLocation ? 'GPS' : '--'}</Text>
          </View>
        </Animated.View>

        <View style={[styles.section, isDark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('realTimeTelemetry')}</Text>
          <View style={styles.telemetryPillsRow}>
            <View style={styles.telemetryPill}><Text style={styles.telemetryPillLabel}>X</Text><Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_x.toFixed(2)}</Text></View>
            <View style={styles.telemetryPill}><Text style={styles.telemetryPillLabel}>Y</Text><Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_y.toFixed(2)}</Text></View>
            <View style={styles.telemetryPill}><Text style={styles.telemetryPillLabel}>Z</Text><Text style={[styles.telemetryPillValue, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_z.toFixed(2)}</Text></View>
          </View>
          <Text style={styles.gForceText}>G: {telemetry.g_force.toFixed(2)}</Text>
          {telemetryHistory.g.length > 5 && (
            <TelemetryChart
              data={telemetryHistory.g.map((value) => ({ value }))}
              title="G-Force"
              color="#ef4444"
              maxValue={Math.max(3, settings.impact_threshold + 3)}
            />
          )}
        </View>

        <View style={[styles.section, isDark ? styles.cardDark : styles.cardLight]}>
          <View style={styles.safetyHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Radar preventivo IA' : 'AI preventive radar'}
            </Text>
            <View style={[styles.riskPill, { backgroundColor: `${insightColor}33` }]}>
              <Ionicons name="pulse" size={14} color={insightColor} />
              <Text style={[styles.riskPillText, { color: insightColor }]}>
                {insight.level === 'stable'
                  ? (settings.language === 'es' ? 'Estable' : 'Stable')
                  : insight.level === 'caution'
                    ? (settings.language === 'es' ? 'Precaución' : 'Caution')
                    : (settings.language === 'es' ? 'Alto riesgo' : 'High risk')}
              </Text>
            </View>
          </View>
          <View style={styles.safetyGaugeTrack}>
            <View style={[styles.safetyGaugeFill, { width: `${insight.score}%`, backgroundColor: insightColor }]} />
          </View>
          <Text style={[styles.safetyScoreText, isDark ? styles.textDark : styles.textLight]}>
            {settings.language === 'es' ? 'Safety Score' : 'Safety Score'}: {insight.score}/100
          </Text>
          <Text style={[styles.safetyRecommendation, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            {settings.language === 'es' ? insight.recommendationEs : insight.recommendationEn}
          </Text>
        </View>

        {impacts.length > 0 && (
          <View style={[styles.section, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Últimos impactos reales' : 'Recent real impacts'}
            </Text>
            {impacts.slice(0, 3).map((impact) => (
              <View key={impact.id} style={[styles.impactItem, { borderLeftColor: getSeverityColor(impact.severity) }]}> 
                <View>
                  <Text style={[styles.impactG, isDark ? styles.textDark : styles.textLight]}>{impact.g_force.toFixed(1)}G</Text>
                  <Text style={styles.impactMeta}>{new Date(impact.timestamp).toLocaleString()}</Text>
                </View>
                <Text style={{ color: getSeverityColor(impact.severity), fontWeight: '700' }}>{t(impact.severity).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
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

  heroCard: { borderRadius: 24, padding: 18, marginBottom: 14, overflow: 'hidden' },
  heroCardDark: { backgroundColor: '#0f172a' },
  heroCardLight: { backgroundColor: '#ffffff' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logo: { fontSize: 34, fontWeight: '900', letterSpacing: 1 },
  tagline: { fontSize: 12, marginTop: 2, maxWidth: 210 },
  textDark: { color: '#f8fafc' },
  textLight: { color: '#0f172a' },
  subtitleDark: { color: '#94a3b8' },
  subtitleLight: { color: '#475569' },

  channelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  channelPillDark: { backgroundColor: '#052e16' },
  channelPillLight: { backgroundColor: '#dcfce7' },
  channelPillText: { color: '#22c55e', fontWeight: '700', fontSize: 12 },

  statusPill: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  statusPillOnline: { backgroundColor: 'rgba(34,197,94,0.16)' },
  statusPillOffline: { backgroundColor: 'rgba(239,68,68,0.18)' },
  statusDot: { width: 8, height: 8, borderRadius: 6 },
  statusDotOnline: { backgroundColor: '#22c55e' },
  statusDotOffline: { backgroundColor: '#ef4444' },
  statusPillText: { color: '#e2e8f0', fontWeight: '700', fontSize: 12 },
  heroDeviceText: { marginTop: 8, fontWeight: '600' },

  quickStatsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickStatCard: { flex: 1, borderRadius: 16, padding: 12, borderWidth: 1 },
  quickStatLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  quickStatValue: { fontSize: 30, fontWeight: '900' },

  section: { borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1 },
  cardDark: { backgroundColor: '#0f172a', borderColor: '#1e293b' },
  cardLight: { backgroundColor: '#fff', borderColor: '#dbeafe' },
  sectionTitle: { fontSize: 26, fontWeight: '800', marginBottom: 12 },

  telemetryPillsRow: { flexDirection: 'row', gap: 8 },
  telemetryPill: { flex: 1, backgroundColor: 'rgba(148,163,184,0.15)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  telemetryPillLabel: { color: '#94a3b8', fontWeight: '700' },
  telemetryPillValue: { fontSize: 21, fontWeight: '900' },
  gForceText: { color: '#ef4444', fontSize: 44, fontWeight: '900', marginVertical: 10 },

  impactItem: { borderLeftWidth: 4, backgroundColor: 'rgba(30,41,59,0.4)', padding: 12, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  impactG: { fontSize: 22, fontWeight: '900' },
  impactMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  safetyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  riskPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  riskPillText: { fontWeight: '700', fontSize: 12 },
  safetyGaugeTrack: { height: 12, backgroundColor: 'rgba(148,163,184,0.2)', borderRadius: 999, overflow: 'hidden' },
  safetyGaugeFill: { height: '100%', borderRadius: 999 },
  safetyScoreText: { marginTop: 10, fontWeight: '800', fontSize: 16 },
  safetyRecommendation: { marginTop: 6, lineHeight: 20, fontSize: 13 },
});
