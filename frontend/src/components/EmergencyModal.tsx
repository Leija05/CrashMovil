import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Vibration,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore, ImpactEvent } from '../store/crashStore';
import { impactsApi, diagnosisApi } from '../services/api';
import * as Linking from 'expo-linking';

const { width, height } = Dimensions.get('window');

interface EmergencyModalProps {
  visible: boolean;
  onClose: () => void;
  impact: ImpactEvent | null;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({ visible, onClose, impact }) => {
  const { t } = useTranslation();
  const {
    settings,
    contacts,
    profile,
    setEmergencyActive,
    user,
  } = useCrashStore();
  
  // Local countdown state for the modal
  const [localCountdown, setLocalCountdown] = useState(settings.countdown_seconds);
  const [alertSent, setAlertSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const alertSentRef = useRef(false);
  
  const startPulseAnimation = useCallback(() => {
    pulseAnim.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);
  
  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const fetchDiagnosis = useCallback(async () => {
    if (!impact) return;
    setLoadingDiagnosis(true);
    
    try {
      if (!user) {
        setDiagnosis({
          severity_assessment:
            settings.language === 'es'
              ? 'Diagnóstico local (inicia sesión para IA completa).'
              : 'Local diagnosis (sign in for full AI).',
          probable_injuries: [],
          first_aid_steps: [settings.language === 'es' ? 'Llamar al 911' : 'Call 911'],
          warnings: [],
          recommendation:
            settings.language === 'es'
              ? 'Mantener a la víctima inmóvil.'
              : 'Keep victim still until responders arrive.',
        });
        return;
      }

      const response = await diagnosisApi.get({
        g_force: impact.g_force,
        acceleration_x: impact.acceleration_x,
        acceleration_y: impact.acceleration_y,
        acceleration_z: impact.acceleration_z,
        gyro_x: impact.gyro_x,
        gyro_y: impact.gyro_y,
        gyro_z: impact.gyro_z,
        blood_type: profile?.blood_type,
        allergies: profile?.allergies,
        medical_conditions: profile?.medical_conditions,
        language: settings.language,
      });
      setDiagnosis(response.data);
    } catch (error) {
      console.error('Diagnosis error:', error);
    } finally {
      setLoadingDiagnosis(false);
    }
  }, [impact, profile?.allergies, profile?.blood_type, profile?.medical_conditions, settings.language, user]);
  
  const sendEmergencyAlert = useCallback(async () => {
    setAlertSent(true);
    Vibration.cancel();
    pulseAnim.stopAnimation();
    
    // Get AI diagnosis
    fetchDiagnosis();
    
    // Message dispatch is backend-driven. Here we only reflect UI status.
    if (settings.sms_enabled && contacts.length > 0 && impact) {
      setSmsSent((impact.alerts_dispatched ?? 0) > 0);
    }
    
    // Auto call primary contact after 3 seconds
    if (settings.auto_call_enabled) {
      const primaryContact = contacts.find(c => c.is_primary);
      if (primaryContact) {
        setTimeout(() => {
          Linking.openURL(`tel:${primaryContact.phone}`).catch(err => 
            console.log('Call not available:', err)
          );
        }, 3000);
      }
    }
  }, [contacts, fetchDiagnosis, impact, pulseAnim, settings.auto_call_enabled, settings.sms_enabled]);

  const startCountdown = useCallback(() => {
    // Clear any existing interval first
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    countdownRef.current = setInterval(() => {
      setLocalCountdown((prev) => {
        if (prev <= 1) {
          // Countdown reached 0
          stopCountdown();
          if (!alertSentRef.current) {
            alertSentRef.current = true;
            sendEmergencyAlert();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [sendEmergencyAlert, stopCountdown]);
  
  // ============================================================
  // ALERT DISPATCH STATUS
  // NOTE: real SMS/WhatsApp dispatch is handled by backend when impact is created.
  // ============================================================
  // ============================================================
  // END ALERT DISPATCH STATUS
  // ============================================================

  useEffect(() => {
    if (visible && impact) {
      // Reset state when modal opens
      setLocalCountdown(settings.countdown_seconds);
      setAlertSent(false);
      setSmsSent(false);
      alertSentRef.current = false;
      setDiagnosis(null);
      startCountdown();
      startPulseAnimation();
      Vibration.vibrate([500, 500, 500, 500], true);
    } else {
      stopCountdown();
      Vibration.cancel();
      pulseAnim.stopAnimation();
    }
    
    return () => {
      stopCountdown();
      Vibration.cancel();
    };
  }, [impact, pulseAnim, settings.countdown_seconds, startCountdown, startPulseAnimation, stopCountdown, visible]);
  
  const handleCancelAlarm = async () => {
    stopCountdown();
    Vibration.cancel();
    pulseAnim.stopAnimation();
    setEmergencyActive(false);
    
    if (impact && user) {
      try {
        await impactsApi.markFalseAlarm(impact.id);
      } catch (error) {
        console.log('Error marking false alarm:', error);
      }
    }
    
    Alert.alert(
      settings.language === 'es' ? 'Alarma Cancelada' : 'Alarm Cancelled',
      settings.language === 'es' ? 'Falsa alarma registrada' : 'False alarm registered'
    );
    onClose();
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'high': return '#f44336';
      case 'critical': return '#9C27B0';
      default: return '#FF5722';
    }
  };
  
  if (!impact) return null;
  
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: getSeverityColor(impact.severity) }]}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons name="warning" size={60} color="#fff" />
            </Animated.View>
            <Text style={styles.headerTitle}>{t('emergencyDetected')}</Text>
            <Text style={styles.impactInfo}>
              {impact.g_force.toFixed(1)}G - {t(impact.severity).toUpperCase()}
            </Text>
          </View>
          
          {/* Countdown - Only show when alert not sent */}
          {!alertSent && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownLabel}>{t('sendingAlert')}</Text>
              <Text style={styles.countdownNumber}>{localCountdown}</Text>
              <Text style={styles.countdownLabel}>{t('seconds')}</Text>
              
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAlarm}>
                <Ionicons name="close-circle" size={24} color="#fff" />
                <Text style={styles.cancelButtonText}>{t('cancelAlarm')}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Alert Sent / Diagnosis */}
          {alertSent && (
            <ScrollView style={styles.diagnosisScrollView} contentContainerStyle={styles.diagnosisContainer}>
              <View style={styles.alertSentBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <Text style={styles.alertSentText}>
                  {settings.language === 'es'
                    ? (smsSent ? 'Alerta enviada' : 'Alerta no enviada')
                    : (smsSent ? 'Alert sent' : 'Alert not sent')}
                </Text>
              </View>
              
              {/* SMS Status */}
              <View style={styles.smsStatusContainer}>
                <Ionicons 
                  name={smsSent ? "chatbubble-ellipses" : "chatbubble-outline"} 
                  size={20} 
                  color={smsSent ? "#4CAF50" : "#FF9800"} 
                />
                <Text style={[styles.smsStatusText, { color: smsSent ? "#4CAF50" : "#FF9800" }]}>
                  {settings.language === 'es' 
                    ? (
                      smsSent
                        ? 'Alerta enviada desde el backend a contactos de emergencia'
                        : 'No se pudo confirmar envío automático. Revisa configuración de WhatsApp Cloud API y contactos verificados.'
                    )
                    : (
                      smsSent
                        ? 'Alert dispatched from backend to emergency contacts'
                        : 'Automatic dispatch could not be confirmed. Check WhatsApp Cloud API config and verified contacts.'
                    )}
                </Text>
              </View>
              
              {loadingDiagnosis ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>{t('loading')}</Text>
                </View>
              ) : diagnosis ? (
                <View style={styles.diagnosisContent}>
                  <Text style={styles.diagnosisTitle}>{t('aiDiagnosis')}</Text>
                  
                  <View style={styles.diagnosisSection}>
                    <Text style={styles.diagnosisSectionTitle}>{t('severityAssessment')}</Text>
                    <Text style={styles.diagnosisText}>{diagnosis.severity_assessment}</Text>
                  </View>
                  
                  <View style={styles.diagnosisSection}>
                    <Text style={styles.diagnosisSectionTitle}>{t('firstAidSteps')}</Text>
                    {diagnosis.first_aid_steps?.map((step: string, index: number) => (
                      <Text key={index} style={styles.diagnosisListItem}>
                        {index + 1}. {step}
                      </Text>
                    ))}
                  </View>
                  
                  <View style={styles.warningBox}>
                    <Ionicons name="alert-circle" size={20} color="#FF9800" />
                    <Text style={styles.warningText}>{diagnosis.recommendation}</Text>
                  </View>
                </View>
              ) : null}
              
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>
                  {settings.language === 'es' ? 'Cerrar' : 'Close'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width - 40,
    maxHeight: height - 100,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    padding: 30,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
    textAlign: 'center',
  },
  impactInfo: {
    fontSize: 18,
    color: '#fff',
    marginTop: 5,
    opacity: 0.9,
  },
  countdownContainer: {
    padding: 30,
    alignItems: 'center',
  },
  countdownLabel: {
    fontSize: 16,
    color: '#aaa',
  },
  countdownNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 15,
    fontVariant: ['tabular-nums'],
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 20,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  diagnosisScrollView: {
    maxHeight: height - 300,
  },
  diagnosisContainer: {
    padding: 20,
  },
  alertSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  alertSentText: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  smsStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  smsStatusText: {
    fontSize: 14,
    marginLeft: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    textAlign: 'center',
    fontSize: 16,
  },
  diagnosisContent: {
    marginBottom: 10,
  },
  diagnosisTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
    textAlign: 'center',
  },
  diagnosisSection: {
    marginBottom: 15,
  },
  diagnosisSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00d9ff',
    marginBottom: 5,
  },
  diagnosisText: {
    fontSize: 14,
    color: '#ddd',
    lineHeight: 20,
  },
  diagnosisListItem: {
    fontSize: 14,
    color: '#ddd',
    lineHeight: 22,
    marginLeft: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,152,0,0.1)',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#FF9800',
    marginLeft: 10,
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
