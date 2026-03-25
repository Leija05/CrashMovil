import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCrashStore } from '../src/store/crashStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setAuthToken, settingsApi } from '../src/services/api';
import '../src/i18n';
import i18n from '../src/i18n';

export default function RootLayout() {
  const { settings, setSettings, setAuthSession } = useCrashStore();
  const isDark = settings.theme === 'dark';

  // Restore auth session and load user settings on app start
  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (!token) {
          return;
        }

        setAuthToken(token);
        const meResponse = await authApi.me();
        setAuthSession(token, meResponse.data);

        const response = await settingsApi.get();
        if (response.data) {
          setSettings(response.data);
          i18n.changeLanguage(response.data.language);
        }
      } catch (error) {
        await AsyncStorage.removeItem('auth_token');
        setAuthToken(null);
        setAuthSession(null, null);
      }
    };
    bootstrapSession();
  }, [setAuthSession, setSettings]);

  useEffect(() => {
    i18n.changeLanguage(settings.language);
  }, [settings.language]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? '#0c0c0c' : '#f5f5f5',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="diagnosis"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
