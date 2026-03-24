import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCrashStore } from '../src/store/crashStore';
import { settingsApi } from '../src/services/api';
import '../src/i18n';
import i18n from '../src/i18n';

export default function RootLayout() {
  const { settings, setSettings } = useCrashStore();
  const isDark = settings.theme === 'dark';

  // Load settings from backend on app start
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await settingsApi.get();
        if (response.data) {
          setSettings(response.data);
          i18n.changeLanguage(response.data.language);
        }
      } catch (error) {
        console.log('Using default settings');
      }
    };
    loadSettings();
  }, []);

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
