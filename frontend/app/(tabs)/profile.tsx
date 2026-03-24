import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore } from '../../src/store/crashStore';
import { authApi, profileApi, setAuthToken } from '../../src/services/api';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const AUTH_TOKEN_KEY = 'auth_token';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, setProfile, settings, user, setAuthSession } = useCrashStore();
  const isDark = settings.theme === 'dark';

  const [name, setName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const screenTexts = useMemo(
    () => ({
      loginTitle: settings.language === 'es' ? 'Iniciar sesión' : 'Sign in',
      registerTitle: settings.language === 'es' ? 'Crear cuenta' : 'Create account',
      email: settings.language === 'es' ? 'Correo electrónico' : 'Email',
      password: settings.language === 'es' ? 'Contraseña' : 'Password',
      registerName: settings.language === 'es' ? 'Nombre completo' : 'Full name',
      authHint:
        settings.language === 'es'
          ? 'Inicia sesión para ver y editar tu perfil médico.'
          : 'Sign in to view and edit your medical profile.',
      switchToRegister: settings.language === 'es' ? 'Crear cuenta nueva' : 'Create new account',
      switchToLogin: settings.language === 'es' ? 'Ya tengo cuenta' : 'I already have an account',
      logout: settings.language === 'es' ? 'Cerrar sesión' : 'Sign out',
      authError: settings.language === 'es' ? 'No se pudo iniciar sesión' : 'Could not sign in',
      profileError: settings.language === 'es' ? 'No se pudo cargar tu perfil' : 'Could not load your profile',
    }),
    [settings.language],
  );

  const loadProfile = useCallback(async () => {
    try {
      const response = await profileApi.get();
      if (response.data) {
        setProfile(response.data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert(settings.language === 'es' ? 'Error' : 'Error', screenTexts.profileError);
    }
  }, [screenTexts.profileError, setProfile, settings.language]);

  const restoreSession = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        return;
      }

      setAuthToken(storedToken);
      const meResponse = await authApi.me();
      setAuthSession(storedToken, meResponse.data);
      await loadProfile();
    } catch (error) {
      console.error('Error restoring session:', error);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthToken(null);
      setAuthSession(null, null);
    }
  }, [loadProfile, setAuthSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setBloodType(profile.blood_type || '');
      setAllergies(profile.allergies || '');
      setMedicalConditions(profile.medical_conditions || '');
      setEmergencyNotes(profile.emergency_notes || '');
    }
  }, [profile]);

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert(
        settings.language === 'es' ? 'Datos incompletos' : 'Missing data',
        settings.language === 'es'
          ? 'Correo y contraseña son obligatorios.'
          : 'Email and password are required.',
      );
      return;
    }

    if (isRegisterMode && !authName.trim()) {
      Alert.alert(
        settings.language === 'es' ? 'Datos incompletos' : 'Missing data',
        settings.language === 'es' ? 'El nombre es obligatorio para registrarte.' : 'Name is required to register.',
      );
      return;
    }

    setAuthLoading(true);
    try {
      const payload = {
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      };

      const response = isRegisterMode
        ? await authApi.register({ ...payload, full_name: authName.trim() })
        : await authApi.login(payload);

      const token = response.data.access_token;
      const loggedUser = response.data.user;

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      setAuthToken(token);
      setAuthSession(token, loggedUser);
      setAuthPassword('');

      await loadProfile();
    } catch (error) {
      console.error('Error signing in:', error);
      Alert.alert(settings.language === 'es' ? 'Error' : 'Error', screenTexts.authError);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
    setAuthSession(null, null);
    setProfile(null);
    setName('');
    setBloodType('');
    setAllergies('');
    setMedicalConditions('');
    setEmergencyNotes('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        settings.language === 'es' ? 'Error' : 'Error',
        settings.language === 'es' ? 'El nombre es requerido' : 'Name is required',
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
        settings.language === 'es' ? 'Perfil actualizado correctamente' : 'Profile updated successfully',
      );
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(
        settings.language === 'es' ? 'Error' : 'Error',
        settings.language === 'es' ? 'No se pudo guardar el perfil' : 'Could not save profile',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{t('userProfile')}</Text>

          {!user ? (
            <View style={[styles.authCard, isDark ? styles.authCardDark : styles.authCardLight]}>
              <Text style={[styles.authTitle, isDark ? styles.textDark : styles.textLight]}>
                {isRegisterMode ? screenTexts.registerTitle : screenTexts.loginTitle}
              </Text>
              <Text style={styles.subtitle}>{screenTexts.authHint}</Text>

              {isRegisterMode && (
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={authName}
                  onChangeText={setAuthName}
                  placeholder={screenTexts.registerName}
                  placeholderTextColor="#888"
                />
              )}

              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={authEmail}
                onChangeText={setAuthEmail}
                placeholder={screenTexts.email}
                placeholderTextColor="#888"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder={screenTexts.password}
                placeholderTextColor="#888"
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.saveButton, authLoading && styles.saveButtonDisabled]}
                onPress={handleAuthSubmit}
                disabled={authLoading}
              >
                <Ionicons name="log-in" size={20} color="#000" />
                <Text style={styles.saveButtonText}>
                  {authLoading
                    ? settings.language === 'es'
                      ? 'Procesando...'
                      : 'Processing...'
                    : isRegisterMode
                      ? screenTexts.registerTitle
                      : screenTexts.loginTitle}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsRegisterMode((prev) => !prev)} style={styles.switchAuthButton}>
                <Text style={styles.switchAuthText}>
                  {isRegisterMode ? screenTexts.switchToLogin : screenTexts.switchToRegister}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sessionHeader}>
                <Text style={styles.subtitle}>{user.email}</Text>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                  <Ionicons name="log-out-outline" size={16} color="#fff" />
                  <Text style={styles.logoutText}>{screenTexts.logout}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.subtitle}>
                {settings.language === 'es'
                  ? 'Esta información se compartirá con los servicios de emergencia'
                  : 'This information will be shared with emergency services'}
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('name')} *</Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={name}
                  onChangeText={setName}
                  placeholder={settings.language === 'es' ? 'Tu nombre completo' : 'Your full name'}
                  placeholderTextColor="#888"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('bloodType')}</Text>
                <View style={styles.bloodTypeContainer}>
                  {BLOOD_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.bloodTypeButton, bloodType === type && styles.bloodTypeButtonActive]}
                      onPress={() => setBloodType(bloodType === type ? '' : type)}
                    >
                      <Text style={[styles.bloodTypeText, bloodType === type && styles.bloodTypeTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('allergies')}</Text>
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

              <View style={styles.field}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('medicalConditions')}</Text>
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

              <View style={styles.field}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('emergencyNotes')}</Text>
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

              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={loading}
              >
                <Ionicons name="save" size={20} color="#000" />
                <Text style={styles.saveButtonText}>
                  {loading ? (settings.language === 'es' ? 'Guardando...' : 'Saving...') : t('save')}
                </Text>
              </TouchableOpacity>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#00d9ff" />
                <Text style={styles.infoText}>
                  {settings.language === 'es'
                    ? 'Esta información será utilizada por la IA para proporcionar recomendaciones médicas más precisas en caso de emergencia.'
                    : 'This information will be used by AI to provide more accurate medical recommendations in case of emergency.'}
                </Text>
              </View>
            </>
          )}
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
    marginBottom: 16,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
  authCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  authCardDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  authCardLight: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e7e7e7',
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  switchAuthButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  switchAuthText: {
    color: '#00d9ff',
    fontSize: 13,
    fontWeight: '600',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#d32f2f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
    marginBottom: 10,
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
