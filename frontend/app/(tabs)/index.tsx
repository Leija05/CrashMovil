import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useCrashStore, ImpactEvent } from '../../src/store/crashStore';
import { impactsApi, contactsApi, settingsApi, statsApi } from '../../src/services/api';
import { TelemetryChart } from '../../src/components/TelemetryChart';
import { EmergencyModal } from '../../src/components/EmergencyModal';
import { CrashLogo } from '../../src/components/CrashLogo';

const { width } = Dimensions.get('window');

// ============================================================
// SIMULATION MODE - Replace with Bluetooth when hardware ready
// ============================================================
const generateSimulatedTelemetry = () => {
  const baseAccelX = (Math.random() - 0.5) * 0.5;
  const baseAccelY = (Math.random() - 0.5) * 0.5;
  const baseAccelZ = 1 + (Math.random() - 0.5) * 0.3;
  const gForce = Math.sqrt(baseAccelX ** 2 + baseAccelY ** 2 + baseAccelZ ** 2);
  
  return {
    acceleration_x: baseAccelX,
    acceleration_y: baseAccelY,
    acceleration_z: baseAccelZ,
    gyro_x: (Math.random() - 0.5) * 10,
    gyro_y: (Math.random() - 0.5) * 10,
    gyro_z: (Math.random() - 0.5) * 10,
    g_force: gForce,
  };
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const {
    isConnected,
    isSimulationMode,
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
  } = useCrashStore();
  
  const isDark = settings.theme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total_impacts: 0, real_impacts: 0, false_alarms: 0 });
  const [telemetryHistory, setTelemetryHistory] = useState<{ x: number[]; y: number[]; z: number[]; g: number[] }>(
    { x: [], y: [], z: [], g: [] }
  );
  
  // Animations
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  
  const simulationInterval = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    loadData();
    requestLocationPermission();
    startEntranceAnimations();
    
    return () => {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
    };
  }, []);
  
  const startEntranceAnimations = () => {
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
  };
  
  useEffect(() => {
    if (isSimulationMode) {
      startSimulation();
      setConnected(true);
    } else {
      stopSimulation();
    }
    
    return () => stopSimulation();
  }, [isSimulationMode]);
  
  const loadData = async () => {
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
  };
  
  const requestLocationPermission = async () => {
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
  };
  
  const startSimulation = () => {
    if (simulationInterval.current) return;
    
    simulationInterval.current = setInterval(() => {
      const newTelemetry = generateSimulatedTelemetry();
      setTelemetry(newTelemetry);
      
      setTelemetryHistory(prev => ({
        x: [...prev.x.slice(-19), newTelemetry.acceleration_x],
        y: [...prev.y.slice(-19), newTelemetry.acceleration_y],
        z: [...prev.z.slice(-19), newTelemetry.acceleration_z],
        g: [...prev.g.slice(-19), newTelemetry.g_force],
      }));
    }, 500);
  };
  
  const stopSimulation = () => {
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }
  };
  
  const simulateImpact = async () => {
    const severities = ['low', 'medium', 'high', 'critical'] as const;
    const selectedSeverity = severities[Math.floor(Math.random() * severities.length)];
    
    let gForce: number;
    switch (selectedSeverity) {
      case 'low': gForce = 3 + Math.random() * 2; break;
      case 'medium': gForce = 5 + Math.random() * 5; break;
      case 'high': gForce = 10 + Math.random() * 5; break;
      case 'critical': gForce = 15 + Math.random() * 10; break;
    }
    
    const impactData = {
      g_force: gForce,
      acceleration_x: (Math.random() - 0.5) * 20,
      acceleration_y: (Math.random() - 0.5) * 20,
      acceleration_z: (Math.random() - 0.5) * 20,
      gyro_x: (Math.random() - 0.5) * 100,
      gyro_y: (Math.random() - 0.5) * 100,
      gyro_z: (Math.random() - 0.5) * 100,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
    };
    
    try {
      const response = await impactsApi.create(impactData);
      const impact = response.data;
      setCurrentImpact(impact);
      setEmergencyActive(true);
      setImpacts([impact, ...impacts]);
    } catch (error) {
      console.error('Error creating impact:', error);
      const localImpact: ImpactEvent = {
        id: `sim-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...impactData,
        severity: selectedSeverity,
        was_false_alarm: false,
      };
      setCurrentImpact(localImpact);
      setEmergencyActive(true);
    }
  };
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);
  
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header with Animated Logo */}
        <Animated.View style={[
          styles.header,
          {
            opacity: titleAnim,
            transform: [{
              translateY: titleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            }],
          },
        ]}>
          <View style={styles.logoContainer}>
            <CrashLogo size={38} color="#dc2626" animated={true} />
            <View style={styles.titleContainer}>
              <Text style={[styles.logo, isDark ? styles.textDark : styles.textLight]}>
                C.R.A.S.H.
              </Text>
              <Text style={[styles.tagline, isDark ? styles.taglineDark : styles.taglineLight]}>
                Collision Response and Safety Hardware
              </Text>
            </View>
          </View>
          {isSimulationMode && (
            <View style={styles.simBadge}>
              <Text style={styles.simBadgeText}>SIM</Text>
            </View>
          )}
        </Animated.View>
        
        {/* Status Card with Animation */}
        <Animated.View style={[
          styles.statusCard, 
          isConnected 
            ? (isDark ? styles.statusActiveDark : styles.statusActiveLight) 
            : (isDark ? styles.statusInactiveDark : styles.statusInactiveLight),
          {
            opacity: cardAnim,
            transform: [{
              translateY: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            }],
          },
        ]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconContainer, isConnected ? styles.statusIconActive : styles.statusIconInactive]}>
              <Ionicons
                name={isConnected ? 'shield-checkmark' : 'shield-outline'}
                size={32}
                color={isConnected ? '#22c55e' : '#ef4444'}
              />
            </View>
            <View style={styles.statusInfo}>
              <Text style={[styles.statusTitle, isDark ? styles.textDark : styles.textLight]}>
                {isConnected ? t('systemActive') : t('systemInactive')}
              </Text>
              <Text style={[styles.statusSubtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
                {t('linkedDevice')}: {isConnected ? settings.device_name : t('notConnected')}
              </Text>
            </View>
          </View>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="battery-charging" size={20} color="#dc2626" />
              <Text style={[styles.statValue, isDark ? styles.textDark : styles.textLight]}>{batteryLevel}%</Text>
              <Text style={[styles.statLabel, isDark ? styles.labelDark : styles.labelLight]}>{t('battery')}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="document-text" size={20} color="#dc2626" />
              <Text style={[styles.statValue, isDark ? styles.textDark : styles.textLight]}>{stats.real_impacts}</Text>
              <Text style={[styles.statLabel, isDark ? styles.labelDark : styles.labelLight]}>{t('records')}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="location" size={20} color="#dc2626" />
              <Text style={[styles.statValue, isDark ? styles.textDark : styles.textLight]}>{currentLocation ? 'GPS' : '--'}</Text>
              <Text style={[styles.statLabel, isDark ? styles.labelDark : styles.labelLight]}>{t('location')}</Text>
            </View>
          </View>
        </Animated.View>
        
        {/* Telemetry Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
            {t('realTimeTelemetry')}
          </Text>
          
          <View style={styles.telemetryValues}>
            <View style={[styles.telemetryValue, isDark ? styles.telemetryValueDark : styles.telemetryValueLight, { borderLeftColor: '#ef4444' }]}>
              <Text style={[styles.telemetryLabel, isDark ? styles.labelDark : styles.labelLight]}>X</Text>
              <Text style={[styles.telemetryNumber, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_x.toFixed(2)}</Text>
            </View>
            <View style={[styles.telemetryValue, isDark ? styles.telemetryValueDark : styles.telemetryValueLight, { borderLeftColor: '#22c55e' }]}>
              <Text style={[styles.telemetryLabel, isDark ? styles.labelDark : styles.labelLight]}>Y</Text>
              <Text style={[styles.telemetryNumber, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_y.toFixed(2)}</Text>
            </View>
            <View style={[styles.telemetryValue, isDark ? styles.telemetryValueDark : styles.telemetryValueLight, { borderLeftColor: '#3b82f6' }]}>
              <Text style={[styles.telemetryLabel, isDark ? styles.labelDark : styles.labelLight]}>Z</Text>
              <Text style={[styles.telemetryNumber, isDark ? styles.textDark : styles.textLight]}>{telemetry.acceleration_z.toFixed(2)}</Text>
            </View>
            <View style={[styles.telemetryValue, isDark ? styles.telemetryValueDark : styles.telemetryValueLight, { borderLeftColor: '#dc2626' }]}>
              <Text style={[styles.telemetryLabel, isDark ? styles.labelDark : styles.labelLight]}>G</Text>
              <Text style={[styles.telemetryNumber, { color: '#dc2626', fontWeight: 'bold' }]}>{telemetry.g_force.toFixed(2)}</Text>
            </View>
          </View>
          
          {telemetryHistory.g.length > 5 && (
            <TelemetryChart
              data={telemetryHistory.g.map(v => ({ value: v }))}
              title="G-Force"
              color="#dc2626"
              maxValue={3}
            />
          )}
        </View>
        
        {/* Simulation Button */}
        {isSimulationMode && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.simulateButton} onPress={simulateImpact}>
              <Ionicons name="warning" size={24} color="#fff" />
              <Text style={styles.simulateButtonText}>{t('simulateImpact')}</Text>
            </TouchableOpacity>
            <Text style={[styles.simulateHint, isDark ? styles.hintDark : styles.hintLight]}>
              {settings.language === 'es'
                ? '* Este boton simula un impacto para pruebas'
                : '* This button simulates an impact for testing'}
            </Text>
          </View>
        )}
        
        {/* Recent Impacts */}
        {impacts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Ultimos Impactos' : 'Recent Impacts'}
            </Text>
            {impacts.slice(0, 3).map((impact) => (
              <View key={impact.id} style={[styles.impactItem, isDark ? styles.impactItemDark : styles.impactItemLight, { borderLeftColor: getSeverityColor(impact.severity) }]}>
                <View style={styles.impactInfo}>
                  <Text style={[styles.impactGForce, isDark ? styles.textDark : styles.textLight]}>{impact.g_force.toFixed(1)}G</Text>
                  <Text style={[styles.impactSeverity, { color: getSeverityColor(impact.severity) }]}>
                    {t(impact.severity).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.impactTime, isDark ? styles.labelDark : styles.labelLight]}>
                  {new Date(impact.timestamp).toLocaleString()}
                </Text>
                {impact.was_false_alarm && (
                  <Text style={styles.falseAlarmBadge}>
                    {settings.language === 'es' ? 'Falsa alarma' : 'False alarm'}
                  </Text>
                )}
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
  container: {
    flex: 1,
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  containerLight: {
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleContainer: {
    flexDirection: 'column',
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  tagline: {
    fontSize: 9,
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  taglineDark: {
    color: '#6b7280',
  },
  taglineLight: {
    color: '#6b7280',
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#0f172a',
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  subtitleLight: {
    color: '#64748b',
  },
  labelDark: {
    color: '#6b7280',
  },
  labelLight: {
    color: '#64748b',
  },
  hintDark: {
    color: '#6b7280',
  },
  hintLight: {
    color: '#64748b',
  },
  simBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  simBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
  statusCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  statusActiveDark: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  statusActiveLight: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statusInactiveDark: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusInactiveLight: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusIconInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusInfo: {
    marginLeft: 16,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  statusSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 10,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  telemetryValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  telemetryValue: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    borderLeftWidth: 3,
  },
  telemetryValueDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  telemetryValueLight: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  telemetryLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  telemetryNumber: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  simulateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    padding: 18,
    borderRadius: 16,
    gap: 12,
  },
  simulateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  simulateHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
  impactItem: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  impactItemDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  impactItemLight: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  impactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  impactGForce: {
    fontSize: 22,
    fontWeight: '900',
    marginRight: 12,
  },
  impactSeverity: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  impactTime: {
    fontSize: 12,
  },
  falseAlarmBadge: {
    fontSize: 11,
    color: '#f59e0b',
    marginTop: 6,
    fontWeight: '600',
  },
});
