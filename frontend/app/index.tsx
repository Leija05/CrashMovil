import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCrashStore } from '../src/store/crashStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setAuthToken } from '../src/services/api';

// Bloqueamos el cierre automático del Splash
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setAuthSession, settings } = useCrashStore();
  const isDark = settings.theme === 'dark';

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
          setAuthToken(token);
          const res = await authApi.me();
          setAuthSession(token, res.data);
        }
      } catch (e) {
        console.warn("No hay sesión activa");
      } finally {
        // Ocultamos el Splash solo cuando terminamos de revisar el token
        await SplashScreen.hideAsync();
      }
    }
    restoreSession();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: isDark ? '#0c0c0c' : '#f5f5f5' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}