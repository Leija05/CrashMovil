import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
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

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, title, color, maxValue, threshold, unit = 'G' }) => {
  const { settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  const [containerWidth, setContainerWidth] = useState(0);
  const lastWidthRef = useRef(0);
  const computedMaxValue = useMemo(() => {
    if (typeof maxValue === 'number' && Number.isFinite(maxValue)) {
      return maxValue;
    }

    const localMax = Math.max(...data.map((point) => Math.abs(point.value)), 0);
    const withThreshold = typeof threshold === 'number' ? Math.max(localMax, threshold) : localMax;
    return withThreshold > 0 ? withThreshold * 1.2 : 10;
  }, [data, maxValue, threshold]);
  const chartData = useMemo(
    () =>
      data.map((point, index) => ({
        ...point,
        label: index % 10 === 0 ? `${index}` : '',
      })),
    [data],
  );

  return (
    <View
      style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (Math.abs(nextWidth - lastWidthRef.current) < 2) return;
        lastWidthRef.current = nextWidth;
        setContainerWidth(nextWidth);
      }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{title}</Text>
        <Text style={styles.unitText}>Unidad: {unit}</Text>
      </View>
      {containerWidth > 0 && (
        <LineChart
          data={chartData}
          width={Math.max(140, containerWidth - 26)}
          height={180}
          color={color}
          thickness={3}
          dataPointsColor={color}
          dataPointsRadius={2}
          yAxisColor={isDark ? '#35506e' : '#9db4cc'}
          xAxisColor={isDark ? '#35506e' : '#9db4cc'}
          rulesColor={isDark ? 'rgba(115,140,170,0.18)' : 'rgba(71,85,105,0.16)'}
          yAxisTextStyle={{ color: isDark ? '#9fb7d0' : '#52657f', fontSize: 10 }}
          xAxisLabelTextStyle={{ color: isDark ? '#9fb7d0' : '#52657f', fontSize: 10 }}
          curved
          areaChart
          startFillColor={color}
          endFillColor={isDark ? '#05152c' : '#d8ecff'}
          startOpacity={0.35}
          endOpacity={0.06}
          maxValue={computedMaxValue}
          noOfSections={5}
          stepValue={Math.max(1, Math.ceil(computedMaxValue / 5))}
        />
      )}
      {typeof threshold === 'number' && (
        <Text style={styles.thresholdText}>Umbral crítico: {threshold.toFixed(1)} {unit}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    overflow: 'hidden',
  },
  containerDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  containerLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unitText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  thresholdText: {
    marginTop: 8,
    fontSize: 11,
    color: '#fb7185',
    fontWeight: '700',
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
});
