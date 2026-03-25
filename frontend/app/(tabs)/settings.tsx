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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import { useCrashStore } from '../../src/store/crashStore';
import { settingsApi } from '../../src/services/api';
import i18n from '../../src/i18n';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const {
    settings,
    updateSettings,
    isSimulationMode,
    setSimulationMode,
    user,
  } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [deviceName, setDeviceName] = useState(settings.device_name);
  
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
  
  const handleDeviceNameSave = () => {
    if (deviceName.trim()) {
      handleUpdateSettings({ device_name: deviceName.trim() });
      Alert.alert(
        settings.language === 'es' ? 'Guardado' : 'Saved',
        settings.language === 'es' ? 'Nombre actualizado' : 'Name updated'
      );
    }
  };
  
  // ============================================================
  // SIMULATION MODE TOGGLE
  // This controls whether the app uses simulated sensor data
  // or waits for real Bluetooth data from Arduino
  // ============================================================
  const handleSimulationToggle = (enabled: boolean) => {
    setSimulationMode(enabled);
  };
  
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
          {t('deviceSettings')}
        </Text>
        
        {/* Device Name */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
            {t('deviceName')}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="CASCO_V2.0"
              placeholderTextColor="#888"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleDeviceNameSave}>
              <Ionicons name="checkmark" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Impact Threshold */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {t('impactThreshold')}
            </Text>
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
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>2G</Text>
            <Text style={styles.sliderLabel}>15G</Text>
          </View>
        </View>
        
        {/* Countdown Time */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {t('countdownTime')}
            </Text>
            <Text style={styles.valueText}>{settings.countdown_seconds}s</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={10}
            maximumValue={60}
            step={5}
            value={settings.countdown_seconds}
            onSlidingComplete={(value) => handleUpdateSettings({ countdown_seconds: value })}
            minimumTrackTintColor="#00d9ff"
            maximumTrackTintColor="#333"
            thumbTintColor="#00d9ff"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>10s</Text>
            <Text style={styles.sliderLabel}>60s</Text>
          </View>
        </View>
        
        {/* Toggles */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="call" size={22} color="#00d9ff" />
              <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>
                {t('autoCall')}
              </Text>
            </View>
            <Switch
              value={settings.auto_call_enabled}
              onValueChange={(value) => handleUpdateSettings({ auto_call_enabled: value })}
              trackColor={{ false: '#767577', true: '#00d9ff' }}
              thumbColor="#fff"
            />
          </View>
          
          <View style={[styles.toggleRow, styles.toggleRowBorder]}>
            <View style={styles.toggleInfo}>
              <Ionicons name="chatbubble-ellipses" size={22} color="#dc2626" />
              <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>
                {t('smsAlert')}
              </Text>
            </View>
            <Switch
              value={settings.sms_enabled}
              onValueChange={(value) => handleUpdateSettings({ sms_enabled: value })}
              trackColor={{ false: '#767577', true: '#dc2626' }}
              thumbColor="#fff"
            />
          </View>
        </View>
        
        {/* Message Type - SMS or WhatsApp */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
            {settings.language === 'es' ? 'Tipo de Mensaje' : 'Message Type'}
          </Text>
          <Text style={[styles.sectionSubtitle, isDark ? { color: '#888' } : { color: '#666' }]}>
            {settings.language === 'es' 
              ? 'Selecciona como enviar alertas de emergencia'
              : 'Select how to send emergency alerts'}
          </Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.message_type === 'sms' && styles.optionButtonActiveRed,
              ]}
              onPress={() => handleUpdateSettings({ message_type: 'sms' })}
            >
              <Ionicons
                name="chatbox"
                size={20}
                color={settings.message_type === 'sms' ? '#fff' : '#888'}
              />
              <Text style={[styles.optionText, settings.message_type === 'sms' && styles.optionTextActiveWhite]}>
                SMS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.message_type === 'whatsapp' && styles.optionButtonActiveGreen,
              ]}
              onPress={() => handleUpdateSettings({ message_type: 'whatsapp' })}
            >
              <Ionicons
                name="logo-whatsapp"
                size={20}
                color={settings.message_type === 'whatsapp' ? '#fff' : '#888'}
              />
              <Text style={[styles.optionText, settings.message_type === 'whatsapp' && styles.optionTextActiveWhite]}>
                WhatsApp
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Language */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
            {t('language')}
          </Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.language === 'es' && styles.optionButtonActive,
              ]}
              onPress={() => handleLanguageChange('es')}
            >
              <Text style={[styles.optionText, settings.language === 'es' && styles.optionTextActive]}>
                Español
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.language === 'en' && styles.optionButtonActive,
              ]}
              onPress={() => handleLanguageChange('en')}
            >
              <Text style={[styles.optionText, settings.language === 'en' && styles.optionTextActive]}>
                English
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Theme */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight]}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
            {t('theme')}
          </Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.theme === 'dark' && styles.optionButtonActive,
              ]}
              onPress={() => handleThemeChange('dark')}
            >
              <Ionicons
                name="moon"
                size={18}
                color={settings.theme === 'dark' ? '#000' : '#888'}
              />
              <Text style={[styles.optionText, settings.theme === 'dark' && styles.optionTextActive]}>
                {t('dark')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                settings.theme === 'light' && styles.optionButtonActive,
              ]}
              onPress={() => handleThemeChange('light')}
            >
              <Ionicons
                name="sunny"
                size={18}
                color={settings.theme === 'light' ? '#000' : '#888'}
              />
              <Text style={[styles.optionText, settings.theme === 'light' && styles.optionTextActive]}>
                {t('light')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Simulation Mode - DEVELOPMENT FEATURE */}
        <View style={[styles.section, isDark ? styles.sectionDark : styles.sectionLight, styles.simulationSection]}>
          <View style={styles.simulationHeader}>
            <Ionicons name="construct" size={22} color="#FF9800" />
            <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
              {t('simulationMode')}
            </Text>
          </View>
          <Text style={styles.simulationDesc}>
            {t('simulationModeDesc')}
          </Text>
          <Text style={styles.simulationNote}>
            {settings.language === 'es'
              ? '* Desactiva esto cuando conectes el dispositivo Arduino real'
              : '* Disable this when connecting real Arduino device'}
          </Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, isDark ? styles.textDark : styles.textLight]}>
              {settings.language === 'es' ? 'Activado' : 'Enabled'}
            </Text>
            <Switch
              value={isSimulationMode}
              onValueChange={handleSimulationToggle}
              trackColor={{ false: '#767577', true: '#FF9800' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
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
    backgroundColor: '#f0f4f8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  valueText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00d9ff',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
  inputLight: {
    backgroundColor: '#f0f0f0',
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#00d9ff',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: '#888',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  toggleRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 16,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  optionButtonActive: {
    backgroundColor: '#dc2626',
  },
  optionButtonActiveRed: {
    backgroundColor: '#dc2626',
  },
  optionButtonActiveGreen: {
    backgroundColor: '#25D366',
  },
  optionText: {
    fontSize: 14,
    color: '#888',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  optionTextActiveWhite: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  simulationSection: {
    borderWidth: 1,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  simulationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 5,
  },
  simulationDesc: {
    fontSize: 13,
    color: '#888',
    marginBottom: 5,
  },
  simulationNote: {
    fontSize: 11,
    color: '#FF9800',
    fontStyle: 'italic',
    marginBottom: 10,
  },
});
