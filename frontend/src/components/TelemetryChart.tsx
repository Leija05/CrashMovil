import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useCrashStore } from '../store/crashStore';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

interface DataPoint {
  value: number;
  label?: string;
}

interface TelemetryChartProps {
  data: DataPoint[];
  title: string;
  color: string;
  maxValue?: number;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, title, color, maxValue }) => {
  const { settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{title}</Text>
      <LineChart
        data={data}
        width={width - 80}
        height={80}
        color={color}
        thickness={2}
        hideDataPoints
        hideYAxisText
        hideAxesAndRules
        curved
        areaChart
        startFillColor={color}
        endFillColor={isDark ? '#1a1a2e' : '#ffffff'}
        startOpacity={0.4}
        endOpacity={0.1}
        maxValue={maxValue || Math.max(...data.map(d => Math.abs(d.value))) * 1.2 || 10}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  containerDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  containerLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
});
