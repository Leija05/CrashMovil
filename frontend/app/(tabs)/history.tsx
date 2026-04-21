import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useCrashStore, ImpactEvent } from '../../src/store/crashStore';
import { impactsApi } from '../../src/services/api';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { impacts, setImpacts, settings, user } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const loadImpacts = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await impactsApi.getAll();
      // PROTECCIÓN: Aseguramos que sea un array para evitar errores en FlatList
      setImpacts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log('Error o sesión expirada al cargar impactos');
      setImpacts([]); // Limpiamos para evitar que la UI intente leer datos viejos
    } finally {
      setIsLoading(false);
    }
  }, [setImpacts, user]);

  useEffect(() => {
    if (user) {
      loadImpacts();
    } else {
      setImpacts([]);
    }
  }, [loadImpacts, setImpacts, user]);
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadImpacts();
    setRefreshing(false);
  }, [loadImpacts]);
  
  const getSeverityColor = (severity: string) => {
    switch (severity || 'low') {
      case 'low': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'high': return '#f44336';
      case 'critical': return '#9C27B0';
      default: return '#00d9ff';
    }
  };
  
  const getSeverityIcon = (severity: string) => {
    switch (severity || 'low') {
      case 'low': return 'alert-circle-outline';
      case 'medium': return 'alert-circle';
      case 'high': return 'warning';
      case 'critical': return 'skull';
      default: return 'help-circle';
    }
  };
  
  const handleViewDiagnosis = (impact: ImpactEvent) => {
    // PROTECCIÓN: Solo navegamos si el impacto existe y convertimos todo a string seguro
    if (!impact) return;
    
    router.push({
      pathname: '/diagnosis',
      params: {
        impactId: String(impact.id || ''),
        gForce: String(impact.g_force ?? 0),
        accelerationX: String(impact.acceleration_x ?? 0),
        accelerationY: String(impact.acceleration_y ?? 0),
        accelerationZ: String(impact.acceleration_z ?? 0),
        gyroX: String(impact.gyro_x ?? 0),
        gyroY: String(impact.gyro_y ?? 0),
        gyroZ: String(impact.gyro_z ?? 0),
        severity: impact.severity || 'low',
      },
    });
  };
  
  const renderImpact = ({ item }: { item: ImpactEvent }) => (
    <View style={[styles.impactCard, isDark ? styles.cardDark : styles.cardLight]}>
      <View style={[styles.severityIndicator, { backgroundColor: getSeverityColor(item.severity) }]} />
      
      <View style={styles.impactContent}>
        <View style={styles.impactHeader}>
          <View style={styles.impactMainInfo}>
            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(item.severity) + '20' }]}>
              <Ionicons
                name={getSeverityIcon(item.severity) as any}
                size={20}
                color={getSeverityColor(item.severity)}
              />
              <Text style={[styles.severityText, { color: getSeverityColor(item.severity) }]}>
                {(t(item.severity || 'low') || '').toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.gForceText, isDark ? styles.textDark : styles.textLight]}>
              {(item.g_force ?? 0).toFixed(1)}G
            </Text>
          </View>
          
          {item.was_false_alarm && (
            <View style={styles.falseAlarmBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#FF9800" />
              <Text style={styles.falseAlarmText}>
                {settings.language === 'es' ? 'Falsa Alarma' : 'False Alarm'}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.impactDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={14} color="#888" />
            <Text style={styles.detailText}>
              {item.timestamp ? new Date(item.timestamp).toLocaleString() : '--/--/--'}
            </Text>
          </View>
        </View>
        
        <View style={styles.telemetryGrid}>
          {/* USAMOS (valor ?? 0) para evitar que .toFixed() mate la app si el valor es null */}
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Accel X</Text>
            <Text style={styles.telemetryValue}>{(item.acceleration_x ?? 0).toFixed(2)}</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Accel Y</Text>
            <Text style={styles.telemetryValue}>{(item.acceleration_y ?? 0).toFixed(2)}</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Accel Z</Text>
            <Text style={styles.telemetryValue}>{(item.acceleration_z ?? 0).toFixed(2)}</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Gyro X</Text>
            <Text style={styles.telemetryValue}>{(item.gyro_x ?? 0).toFixed(1)}</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Gyro Y</Text>
            <Text style={styles.telemetryValue}>{(item.gyro_y ?? 0).toFixed(1)}</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Gyro Z</Text>
            <Text style={styles.telemetryValue}>{(item.gyro_z ?? 0).toFixed(1)}</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.diagnosisButton}
          onPress={() => handleViewDiagnosis(item)}
        >
          <Ionicons name="medkit" size={18} color="#00d9ff" />
          <Text style={styles.diagnosisButtonText}>{t('viewDiagnosis')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
          {t('impactHistory')}
        </Text>
        <Text style={styles.subtitle}>
          {(impacts || []).length} {settings.language === 'es' ? 'registros' : 'records'}
        </Text>
      </View>
      
      {isLoading && <ActivityIndicator color="#00d9ff" style={{ marginVertical: 10 }} />}

      {!user ? (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>
            {settings.language === 'es' ? 'Inicia sesión para ver el historial.' : 'Sign in to view history.'}
          </Text>
        </View>
      ) : (impacts || []).length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>{t('noImpacts')}</Text>
        </View>
      ) : (
        <FlatList
          data={impacts || []}
          renderItem={renderImpact}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d9ff" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#0c0c0c' },
  containerLight: { backgroundColor: '#f0f4f8' },
  header: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  textDark: { color: '#ffffff' },
  textLight: { color: '#000000' },
  listContent: { padding: 20, paddingTop: 0 },
  impactCard: { flexDirection: 'row', borderRadius: 12, marginBottom: 15, overflow: 'hidden' },
  cardDark: { backgroundColor: 'rgba(255,255,255,0.05)' },
  cardLight: { backgroundColor: '#ffffff', elevation: 3 },
  severityIndicator: { width: 4 },
  impactContent: { flex: 1, padding: 15 },
  impactHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  impactMainInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  severityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  severityText: { fontSize: 12, fontWeight: 'bold' },
  gForceText: { fontSize: 24, fontWeight: 'bold' },
  falseAlarmBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,152,0,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  falseAlarmText: { fontSize: 11, color: '#FF9800' },
  impactDetails: { marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { fontSize: 13, color: '#888' },
  telemetryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  telemetryItem: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  telemetryLabel: { fontSize: 10, color: '#666' },
  telemetryValue: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  diagnosisButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,217,255,0.1)', padding: 12, borderRadius: 8 },
  diagnosisButtonText: { color: '#00d9ff', fontSize: 14, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 15 },
});