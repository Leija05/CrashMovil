import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCrashStore } from '../src/store/crashStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setAuthToken, settingsApi } from '../src/services/api';
import i18n from '../src/i18n';

export default function RootLayout() {
  // Estado para controlar que la app no se quede en negro o cargando infinito
  const [isAppReady, setIsAppReady] = useState(false);
  const { settings, setSettings, setAuthSession } = useCrashStore();
  const isDark = settings.theme === 'dark';

  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        console.log("1. Buscando token en almacenamiento...");
        const token = await AsyncStorage.getItem('auth_token');
        
        if (!token) {
          console.log("2. No hay sesión iniciada.");
          setIsAppReady(true);
          return;
        }

        console.log("3. Token encontrado. Verificando con servidor...");
        setAuthToken(token);
        
        // Lógica de "Desbloqueo": Si el servidor no responde en 3 segundos,
        // la aplicación entra de todos modos para no quedarse trabada.
        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 3000)
        );
        
        await Promise.race([
          Promise.all([
            authApi.me().then(res => {
              if (res.data) setAuthSession(token, res.data);
            }).catch(() => null),
            settingsApi.get().then(res => {
              if (res.data) {
                setSettings(res.data);
                if (res.data.language) i18n.changeLanguage(res.data.language);
              }
            }).catch(() => null)
          ]),
          timeout
        ]).catch(() => console.log("Servidor lento o inaccesible, entrando en modo offline."));

      } catch (error) {
        console.error('Error en el proceso de inicio:', error);
        // Si hay un error 401 (No autorizado), limpiamos la sesión
        const statusCode = (error as any)?.response?.status;
        if (statusCode === 401) {
          await AsyncStorage.removeItem('auth_token');
          setAuthToken(null);
          setAuthSession(null, null);
        }
      } finally {
        console.log("4. App lista para renderizar.");
        setIsAppReady(true);
      }
    };

    bootstrapSession();
  }, [setAuthSession, setSettings]);

  // Asegura que el idioma se mantenga actualizado según los ajustes
  useEffect(() => {
    if (settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language]);

  // Mientras la app verifica la sesión, mostramos un cargador sobre el fondo de tu tema
  if (!isAppReady) {
    return (
      <View style={[styles.loading, { backgroundColor: isDark ? '#020617' : '#f5f5f5' }]}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? '#0c0c0c' : '#f5f5f5', // Tu color original
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});