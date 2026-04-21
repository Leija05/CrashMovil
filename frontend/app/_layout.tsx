import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCrashStore } from '../src/store/crashStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setAuthToken, settingsApi } from '../src/services/api';
import i18n from '../src/i18n';

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState(false);
  const settings = useCrashStore(state => state.settings);
  const setSettings = useCrashStore(state => state.setSettings);
  const setAuthSession = useCrashStore(state => state.setAuthSession);
  const isDark = settings.theme === 'dark';

  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        console.log("1. Buscando token en almacenamiento...");
        const token = await AsyncStorage.getItem('auth_token');
        
        if (!token) {
          console.log("2. No hay sesión guardada.");
          setIsAppReady(true);
          return;
        }

        console.log("3. Token encontrado. Verificando con servidor...");
        setAuthToken(token);
        
        // Failsafe: Si el servidor no responde en 3 segundos, entrar como invitado o sesión previa
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        );

        const fetchPromise = Promise.all([
          authApi.me().catch(() => null),
          settingsApi.get().catch(() => null)
        ]);

        const results = await Promise.race([fetchPromise, timeoutPromise])
          .catch(() => {
            console.log("4. El servidor tardó demasiado. Entrando en modo offline/previo.");
            return null;
          });

        if (results) {
          const [meResponse, settingsResponse] = results as any;
          if (meResponse?.data) setAuthSession(token, meResponse.data);
          if (settingsResponse?.data) {
            setSettings(settingsResponse.data);
            i18n.changeLanguage(settingsResponse.data.language);
          }
          console.log("4. Datos recuperados con éxito.");
        }

      } catch (error) {
        console.log("Error en arranque:", error);
      } finally {
        console.log("5. App lista.");
        setIsAppReady(true);
      }
    };

    bootstrapSession();
  }, []); // Solo corre una vez al montar

  if (!isAppReady) {
    return (
      <View style={[styles.loading, { backgroundColor: isDark ? '#020617' : '#f5f5f5' }]}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={{ color: isDark ? '#f8fafc' : '#0f172a', marginTop: 15 }}>
          Iniciando C.R.A.S.H...
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: isDark ? '#0c0c0c' : '#f5f5f5' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="diagnosis" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});