import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore, UserProfile } from '../../src/store/crashStore';
import { profileApi } from '../../src/services/api';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, setProfile, settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [name, setName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadProfile();
  }, []);
  
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setBloodType(profile.blood_type || '');
      setAllergies(profile.allergies || '');
      setMedicalConditions(profile.medical_conditions || '');
      setEmergencyNotes(profile.emergency_notes || '');
    }
  }, [profile]);
  
  const loadProfile = async () => {
    try {
      const response = await profileApi.get();
      if (response.data) {
        setProfile(response.data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };
  
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        settings.language === 'es' ? 'Error' : 'Error',
        settings.language === 'es' ? 'El nombre es requerido' : 'Name is required'
      );
      return;
    }
    
    setLoading(true);
    try {
      const profileData = {
        name: name.trim(),
        blood_type: bloodType || undefined,
        allergies: allergies.trim() || undefined,
        medical_conditions: medicalConditions.trim() || undefined,
        emergency_notes: emergencyNotes.trim() || undefined,
      };
      
      const response = await profileApi.createOrUpdate(profileData);
      setProfile(response.data);
      
      Alert.alert(
        settings.language === 'es' ? 'Guardado' : 'Saved',
        settings.language === 'es' ? 'Perfil actualizado correctamente' : 'Profile updated successfully'
      );
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(
        settings.language === 'es' ? 'Error' : 'Error',
        settings.language === 'es' ? 'No se pudo guardar el perfil' : 'Could not save profile'
      );
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
            {t('userProfile')}
          </Text>
          
          <Text style={styles.subtitle}>
            {settings.language === 'es'
              ? 'Esta información se compartirá con los servicios de emergencia'
              : 'This information will be shared with emergency services'}
          </Text>
          
          {/* Name */}
          <View style={styles.field}>
            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {t('name')} *
            </Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={name}
              onChangeText={setName}
              placeholder={settings.language === 'es' ? 'Tu nombre completo' : 'Your full name'}
              placeholderTextColor="#888"
            />
          </View>
          
          {/* Blood Type */}
          <View style={styles.field}>
            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {t('bloodType')}
            </Text>
            <View style={styles.bloodTypeContainer}>
              {BLOOD_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.bloodTypeButton,
                    bloodType === type && styles.bloodTypeButtonActive,
                  ]}
                  onPress={() => setBloodType(bloodType === type ? '' : type)}
                >
                  <Text
                    style={[
                      styles.bloodTypeText,
                      bloodType === type && styles.bloodTypeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          {/* Allergies */}
          <View style={styles.field}>
            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {t('allergies')}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              value={allergies}
              onChangeText={setAllergies}
              placeholder={settings.language === 'es' ? 'Penicilina, mariscos, etc.' : 'Penicillin, shellfish, etc.'}
              placeholderTextColor="#888"
              multiline
              numberOfLines={3}
            />
          </View>
          
          {/* Medical Conditions */}
          <View style={styles.field}>
            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {t('medicalConditions')}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              value={medicalConditions}
              onChangeText={setMedicalConditions}
              placeholder={settings.language === 'es' ? 'Diabetes, asma, etc.' : 'Diabetes, asthma, etc.'}
              placeholderTextColor="#888"
              multiline
              numberOfLines={3}
            />
          </View>
          
          {/* Emergency Notes */}
          <View style={styles.field}>
            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {t('emergencyNotes')}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              value={emergencyNotes}
              onChangeText={setEmergencyNotes}
              placeholder={
                settings.language === 'es'
                  ? 'Información adicional para personal médico'
                  : 'Additional information for medical personnel'
              }
              placeholderTextColor="#888"
              multiline
              numberOfLines={4}
            />
          </View>
          
          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Ionicons name="save" size={20} color="#000" />
            <Text style={styles.saveButtonText}>
              {loading
                ? (settings.language === 'es' ? 'Guardando...' : 'Saving...')
                : t('save')}
            </Text>
          </TouchableOpacity>
          
          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#00d9ff" />
            <Text style={styles.infoText}>
              {settings.language === 'es'
                ? 'Esta información será utilizada por la IA para proporcionar recomendaciones médicas más precisas en caso de emergencia.'
                : 'This information will be used by AI to provide more accurate medical recommendations in case of emergency.'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 25,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
  inputLight: {
    backgroundColor: '#ffffff',
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  bloodTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bloodTypeButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bloodTypeButtonActive: {
    backgroundColor: 'rgba(244,67,54,0.2)',
    borderColor: '#f44336',
  },
  bloodTypeText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  bloodTypeTextActive: {
    color: '#f44336',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#00d9ff',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(0,217,255,0.1)',
    padding: 15,
    borderRadius: 12,
    marginTop: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#00d9ff',
    lineHeight: 18,
  },
});
