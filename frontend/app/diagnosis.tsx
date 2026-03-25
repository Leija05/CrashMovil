import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCrashStore } from '../src/store/crashStore';
import { diagnosisApi } from '../src/services/api';

export default function DiagnosisScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile, settings, user } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchDiagnosis();
  }, []);
  
  const fetchDiagnosis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!user) {
        setDiagnosis({
          severity_assessment:
            settings.language === 'es'
              ? 'Diagnóstico local (sin sesión iniciada).'
              : 'Local diagnosis (not signed in).',
          probable_injuries: [
            settings.language === 'es' ? 'Posibles contusiones' : 'Possible contusions',
          ],
          first_aid_steps: [
            settings.language === 'es' ? 'Llamar al 911' : 'Call 911',
            settings.language === 'es' ? 'No mover a la víctima' : 'Do not move the victim',
          ],
          warnings: [
            settings.language === 'es'
              ? 'Inicia sesión para diagnóstico IA completo'
              : 'Sign in for full AI diagnosis',
          ],
          recommendation:
            settings.language === 'es'
              ? 'Acude a servicios de emergencia.'
              : 'Seek emergency services immediately.',
        });
        return;
      }

      const response = await diagnosisApi.get({
        g_force: parseFloat(params.gForce as string),
        acceleration_x: parseFloat(params.accelerationX as string),
        acceleration_y: parseFloat(params.accelerationY as string),
        acceleration_z: parseFloat(params.accelerationZ as string),
        gyro_x: parseFloat(params.gyroX as string),
        gyro_y: parseFloat(params.gyroY as string),
        gyro_z: parseFloat(params.gyroZ as string),
        blood_type: profile?.blood_type,
        allergies: profile?.allergies,
        medical_conditions: profile?.medical_conditions,
        language: settings.language,
      });
      
      setDiagnosis(response.data);
    } catch (err) {
      console.error('Diagnosis error:', err);
      setError(settings.language === 'es'
        ? 'No se pudo obtener el diagnóstico'
        : 'Could not get diagnosis');
    } finally {
      setLoading(false);
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'high': return '#f44336';
      case 'critical': return '#9C27B0';
      default: return '#00d9ff';
    }
  };
  
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
          {t('aiDiagnosis')}
        </Text>
        <View style={styles.placeholder} />
      </View>
      
      {/* Impact Info */}
      <View style={[styles.impactInfo, { borderColor: getSeverityColor(params.severity as string) }]}>
        <Text style={styles.impactLabel}>{t('gForce')}</Text>
        <Text style={[styles.impactValue, { color: getSeverityColor(params.severity as string) }]}>
          {parseFloat(params.gForce as string).toFixed(1)}G
        </Text>
        <Text style={[styles.impactSeverity, { color: getSeverityColor(params.severity as string) }]}>
          {t(params.severity as string).toUpperCase()}
        </Text>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00d9ff" />
          <Text style={styles.loadingText}>
            {settings.language === 'es'
              ? 'Analizando datos con IA...'
              : 'Analyzing data with AI...'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={50} color="#f44336" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchDiagnosis}>
            <Text style={styles.retryButtonText}>
              {settings.language === 'es' ? 'Reintentar' : 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : diagnosis ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Severity Assessment */}
          <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics" size={22} color="#00d9ff" />
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('severityAssessment')}
              </Text>
            </View>
            <Text style={[styles.sectionContent, isDark ? styles.textDark : styles.textLight]}>
              {diagnosis.severity_assessment}
            </Text>
          </View>
          
          {/* Probable Injuries */}
          <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="body" size={22} color="#f44336" />
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('probableInjuries')}
              </Text>
            </View>
            {diagnosis.probable_injuries?.map((injury: string, index: number) => (
              <View key={index} style={styles.listItem}>
                <View style={[styles.bullet, { backgroundColor: '#f44336' }]} />
                <Text style={styles.listItemText}>{injury}</Text>
              </View>
            ))}
          </View>
          
          {/* First Aid Steps */}
          <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medkit" size={22} color="#4CAF50" />
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('firstAidSteps')}
              </Text>
            </View>
            {diagnosis.first_aid_steps?.map((step: string, index: number) => (
              <View key={index} style={styles.numberedItem}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{index + 1}</Text>
                </View>
                <Text style={styles.listItemText}>{step}</Text>
              </View>
            ))}
          </View>
          
          {/* Warnings */}
          <View style={[styles.section, styles.warningSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning" size={22} color="#FF9800" />
              <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
                {t('warnings')}
              </Text>
            </View>
            {diagnosis.warnings?.map((warning: string, index: number) => (
              <View key={index} style={styles.listItem}>
                <Ionicons name="alert-circle" size={16} color="#FF9800" />
                <Text style={[styles.listItemText, { color: '#FF9800' }]}>{warning}</Text>
              </View>
            ))}
          </View>
          
          {/* Recommendation */}
          <View style={[styles.section, styles.recommendationSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart" size={22} color="#00d9ff" />
              <Text style={[styles.sectionTitle, { color: '#00d9ff' }]}>
                {t('recommendation')}
              </Text>
            </View>
            <Text style={styles.recommendationText}>
              {diagnosis.recommendation}
            </Text>
          </View>
          
          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle" size={16} color="#666" />
            <Text style={styles.disclaimerText}>
              {settings.language === 'es'
                ? 'Este es un análisis generado por IA con fines informativos. No reemplaza el diagnóstico médico profesional.'
                : 'This is an AI-generated analysis for informational purposes. It does not replace professional medical diagnosis.'}
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerDark: {
    backgroundColor: '#0c0c0c',
  },
  containerLight: {
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 44,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
  impactInfo: {
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  impactLabel: {
    fontSize: 14,
    color: '#888',
  },
  impactValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  impactSeverity: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#888',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 15,
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#00d9ff',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  sectionDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sectionLight: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    color: '#bbb',
    lineHeight: 20,
  },
  numberedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  numberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  warningSection: {
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.3)',
  },
  recommendationSection: {
    backgroundColor: 'rgba(0,217,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,217,255,0.3)',
  },
  recommendationText: {
    fontSize: 15,
    color: '#00d9ff',
    lineHeight: 22,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 15,
    marginTop: 10,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
});
