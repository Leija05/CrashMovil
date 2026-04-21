import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Como este archivo está en src/context, para ir a src/services usamos ../services
import { authAPI } from '../services/api'; 

type AuthState = {
  user: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');
        if (token) {
          const userData = await authAPI.me(token);
          setUser(userData);
        }
      } catch (e) {
        await AsyncStorage.removeItem('access_token');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authAPI.login(email, password);
    if (data.access_token) {
      await AsyncStorage.setItem('access_token', data.access_token);
      setUser(data.user);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('access_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}