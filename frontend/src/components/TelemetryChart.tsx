import React, { useMemo, memo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next'; // <--- IMPORTACIÓN NECESARIA
import { useCrashStore } from '../store/crashStore';

interface DataPoint {
  value: number;
  label?: string;
}

interface TelemetryChartProps {
  data: DataPoint[];
  title: string;
  color: string;
  maxValue?: number;
  threshold?: number;
  unit?: string;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = memo(({ 
  data, 
  title, 
  color, 
  maxValue, 
  threshold, 
  unit = 'G' 
}) => {
  const { t } = useTranslation(); // <--- INICIALIZACIÓN DEL HOOK
  const { settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  const [containerWidth, setContainerWidth] = useState(0);

  // Optimizamos el cálculo del MaxValue para evitar loops
  const computedMaxValue = useMemo(() => {
    if (typeof maxValue === 'number' && Number.isFinite(maxValue) && maxValue > 0) {
      return maxValue;
    }
    const localMax = data.length > 0 ? Math.max(...data.map((p) => Math.abs(p.value))) : 0;
    const baseMax = typeof threshold === 'number' ? Math.max(localMax, threshold) : localMax;
    return Math.ceil((baseMax > 0 ? baseMax * 1.2 : 10) / 2) * 2;
  }, [data.length === 0, maxValue, threshold]);

  const chartData = useMemo(() => {
    return data.map((point, index) => ({
      value: point.value,
      label: index % 20 === 0 ? `${index}` : '',
      hideDataPoint: true, 
    }));
  }, [data]);

  return (
    <View
      style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (Math.abs(containerWidth - width) > 5) {
            setContainerWidth(width);
        }
      }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{title}</Text>
        <Text style={styles.unitText}>Unidad: {unit}</Text>
      </View>
      
      {containerWidth > 0 && (
        <LineChart
          data={chartData}
          width={containerWidth - 40}
          height={160}
          color={color}
          thickness={2.5}
          hideDataPoints
          yAxisColor={isDark ? '#35506e' : '#9db4cc'}
          xAxisColor={isDark ? '#35506e' : '#9db4cc'}
          rulesColor={isDark ? 'rgba(115,140,170,0.1)' : 'rgba(71,85,105,0.08)'}
          yAxisTextStyle={{ color: isDark ? '#9fb7d0' : '#52657f', fontSize: 9 }}
          curved
          isAnimated={false}
          areaChart
          startFillColor={color}
          endFillColor={isDark ? '#02071E' : '#EFF3FB'}
          startOpacity={0.3}
          endOpacity={0.01}
          maxValue={computedMaxValue}
          noOfSections={4}
          initialSpacing={10}
          adjustToWidth
        />
      )}
      
      {typeof threshold === 'number' && (
        <Text style={styles.thresholdText}>
          {t('threshold')}: {threshold.toFixed(1)} {unit}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(30,41,59,0.5)',
  },
  containerDark: { borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
  containerLight: { borderColor: 'rgba(0,0,0,0.05)', borderWidth: 1 },
  header: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  unitText: { fontSize: 11, color: '#06b6d4', fontWeight: '800' },
  thresholdText: {
    marginTop: 10,
    fontSize: 11,
    color: '#fb7185',
    fontWeight: '800',
    textAlign: 'right'
  },
  textDark: { color: '#ffffff' },
  textLight: { color: '#0f172a' },
});