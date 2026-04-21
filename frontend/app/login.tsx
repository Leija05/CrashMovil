import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCrashStore } from '../src/store/crashStore';
import { authApi, setAuthToken } from '../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const router = useRouter();
  const { setAuthSession } = useCrashStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Completa los campos");
    
    setLoading(true);
    try {
      // CORRECCIÓN: Se envía un objeto { email, password } como un solo argumento
      const res = await authApi.login({ email, password });
      
      // Extraemos los datos del cuerpo de la respuesta (Axios usa .data)
      const token = res.data.access_token;
      const userData = res.data.user;
      
      // Guardamos el token para persistencia y para las cabeceras de Axios
      await AsyncStorage.setItem('auth_token', token);
      setAuthToken(token);
      
      // Actualizamos el estado global de Zustand (recibe 2 argumentos: token y usuario)
      setAuthSession(token, userData);
      
      router.replace('/(tabs)');
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Credenciales incorrectas o error de servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>C.R.A.S.H.</Text>
      <View style={styles.form}>
        <TextInput 
          style={styles.input} 
          placeholder="Correo electrónico" 
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Contraseña" 
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry 
        />
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin} 
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0c0c', justifyContent: 'center', padding: 25 },
  title: { color: '#FF3B30', fontSize: 48, fontWeight: '900', textAlign: 'center', marginBottom: 50 },
  form: { gap: 15 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', padding: 20, borderRadius: 15, fontSize: 16 },
  button: { backgroundColor: '#FF3B30', padding: 20, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#000', fontWeight: '900', fontSize: 18 }
});