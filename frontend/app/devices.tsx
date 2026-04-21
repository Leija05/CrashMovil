import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator,
  Alert, RefreshControl, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { COLORS, RADIUS, SPACING } from '../src/theme';
import { useBluetooth } from '../src/context/BluetoothContext';
import type { ScanDevice } from '../src/services/bluetooth';

export default function DevicesScreen() {
  const router = useRouter();
  const {
    nativeAvailable, bluetoothEnabled, status, statusDetail,
    refreshAdapter, requestPermissions, requestEnableBluetooth,
    listPairedDevices, listAllPairedDevices,
    autoConnect, connect, disconnect, connected, device: connectedDevice,
  } = useBluetooth();

  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [autoInProgress, setAutoInProgress] = useState(false);
  const [permsOk, setPermsOk] = useState(Platform.OS !== 'android');
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    const ok = await requestPermissions();
    setPermsOk(ok);
    await refreshAdapter();
    if (!ok) { setScanning(false); setRefreshing(false); return; }
    if (!bluetoothEnabled) {
      const enabled = await requestEnableBluetooth();
      if (!enabled) { setScanning(false); setRefreshing(false); return; }
    }
    const list = showAll ? await listAllPairedDevices() : await listPairedDevices();
    list.sort((a, b) => {
      if (a.isCompatible !== b.isCompatible) return a.isCompatible ? -1 : 1;
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setDevices(list);
    setScanning(false);
    setRefreshing(false);
  }, [requestPermissions, refreshAdapter, requestEnableBluetooth, listPairedDevices, listAllPairedDevices, bluetoothEnabled, showAll]);

  useEffect(() => { scan(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showAll]);

  const handleAutoConnect = async () => {
    setAutoInProgress(true);
    const dev = await autoConnect();
    setAutoInProgress(false);
    if (dev) {
      Alert.alert('¡Conectado!', `Auto-conectado a ${dev.name}. Revisando telemetría...`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } else {
      Alert.alert('Sin éxito', 'No se pudo auto-conectar. Verifica que el HC-05 esté encendido, emparejado y dentro de rango.');
    }
  };

  const handleConnect = async (d: ScanDevice) => {
    if (!d.isCompatible) {
      Alert.alert('Incompatible', `Solo se admiten módulos HC-05 por ahora. "${d.name}" no es compatible.`);
      return;
    }
    setConnectingId(d.id);
    const ok = await connect(d);
    setConnectingId(null);
    if (ok) {
      Alert.alert('¡Conectado!', `Conectado a ${d.name}.`, [
        { text: 'Ir al Dashboard', onPress: () => router.replace('/(tabs)') },
      ]);
    } else {
      Alert.alert('Error de conexión', statusDetail || 'No se pudo abrir la conexión. Verifica que el circuito esté encendido y dentro de rango.');
    }
  };

  const handleDisconnect = async () => { await disconnect(); };

  const renderItem = ({ item }: { item: ScanDevice }) => {
    const isConnecting = connectingId === item.id;
    return (
      <TouchableOpacity
        testID={`bt-device-${item.address}`}
        style={[
          styles.deviceCard,
          item.isCompatible && styles.deviceCardTarget,
          item.connected && styles.deviceCardConnected,
          !item.isCompatible && styles.deviceCardDim,
        ]}
        onPress={() => handleConnect(item)}
        disabled={!!connectingId || !item.isCompatible}
        activeOpacity={0.75}
      >
        <View style={[
          styles.deviceIcon,
          item.isCompatible && styles.deviceIconTarget,
          item.connected && styles.deviceIconConnected,
        ]}>
          <Ionicons
            name={item.connected ? 'checkmark-circle' : item.isCompatible ? 'hardware-chip' : 'bluetooth-outline'}
            size={22}
            color={item.connected ? COLORS.success : item.isCompatible ? COLORS.accent : COLORS.textDim}
          />
        </View>
        <View style={styles.deviceBody}>
          <View style={styles.deviceNameRow}>
            <Text style={[styles.deviceName, !item.isCompatible && { color: COLORS.textSec }]}>
              {item.name}
            </Text>
            {item.connected && (
              <View style={[styles.matchBadge, { backgroundColor: 'rgba(52,211,153,0.15)' }]}>
                <Text style={[styles.matchText, { color: COLORS.success }]}>ACTIVO</Text>
              </View>
            )}
            {item.isCompatible && !item.connected && (
              <View style={styles.matchBadge}>
                <Ionicons name="checkmark-circle" size={10} color={COLORS.accent} />
                <Text style={styles.matchText}>{item.moduleType}</Text>
              </View>
            )}
            {!item.isCompatible && item.moduleType === 'HM-10' && (
              <View style={[styles.matchBadge, { backgroundColor: 'rgba(96,165,250,0.15)' }]}>
                <Text style={[styles.matchText, { color: COLORS.info }]}>PRÓXIMAMENTE</Text>
              </View>
            )}
          </View>
          <Text style={styles.deviceAddr}>{item.address}</Text>
        </View>
        <View style={styles.deviceAction}>
          {isConnecting ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : item.isCompatible ? (
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          ) : (
            <Ionicons name="remove-circle" size={18} color={COLORS.textDim} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const compatibleCount = devices.filter((d) => d.isCompatible).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="devices-back-btn">
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>DISPOSITIVOS</Text>
          <Text style={styles.subtitle}>Selecciona tu módulo HC-05</Text>
        </View>
      </View>

      {/* Connected card */}
      {connected && connectedDevice && (
        <View style={styles.connectedCard}>
          <View style={styles.connectedLeft}>
            <View style={styles.pulse} />
            <View>
              <Text style={styles.connectedLabel}>CONECTADO</Text>
              <Text style={styles.connectedName}>{connectedDevice.name}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} testID="bt-disconnect-btn">
            <Text style={styles.disconnectTxt}>DESCONECTAR</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-connect shortcut */}
      {!connected && compatibleCount > 0 && (
        <TouchableOpacity
          testID="bt-autoconnect-btn"
          style={styles.autoBtn}
          onPress={handleAutoConnect}
          disabled={autoInProgress}
          activeOpacity={0.85}
        >
          {autoInProgress ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <>
              <Ionicons name="flash" size={16} color="#0A0A0A" />
              <Text style={styles.autoBtnText}>AUTO-CONECTAR HC-05</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Not available warning */}
      {!nativeAvailable && (
        <View style={styles.warn}>
          <Ionicons name="warning" size={18} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>Bluetooth no disponible aquí</Text>
            <Text style={styles.warnText}>
              El Bluetooth Clásico requiere una build con expo-dev-client.
              Compila tu APK de desarrollo (`npx expo run:android` o EAS development build) para conectar el HC-05.
            </Text>
          </View>
        </View>
      )}

      {nativeAvailable && !permsOk && (
        <View style={styles.warn}>
          <Ionicons name="lock-closed" size={18} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>Permisos necesarios</Text>
            <Text style={styles.warnText}>Otorga permisos de Bluetooth y ubicación para escanear dispositivos.</Text>
            <TouchableOpacity style={styles.warnBtn} onPress={scan}>
              <Text style={styles.warnBtnText}>SOLICITAR PERMISOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {nativeAvailable && permsOk && !bluetoothEnabled && (
        <View style={styles.warn}>
          <Ionicons name="bluetooth" size={18} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>Bluetooth apagado</Text>
            <Text style={styles.warnText}>Activa el Bluetooth del teléfono para ver los dispositivos emparejados.</Text>
            <TouchableOpacity style={styles.warnBtn} onPress={scan}>
              <Text style={styles.warnBtnText}>ACTIVAR BLUETOOTH</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>
          {showAll ? `TODOS (${devices.length})` : `COMPATIBLES (${devices.length})`}
        </Text>
        <View style={styles.listHeaderRight}>
          <View style={styles.showAllToggle}>
            <Text style={styles.showAllLabel}>Ver todos</Text>
            <Switch
              testID="show-all-switch"
              value={showAll}
              onValueChange={setShowAll}
              trackColor={{ false: '#2A2A34', true: 'rgba(204,255,0,0.45)' }}
              thumbColor={showAll ? COLORS.accent : '#9A9AA8'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
          <TouchableOpacity onPress={scan} disabled={scanning} style={styles.refreshBtn} testID="bt-refresh-btn">
            {scanning ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Ionicons name="refresh" size={18} color={COLORS.accent} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); scan(); }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          scanning ? null : (
            <View style={styles.empty}>
              <Ionicons name="bluetooth-outline" size={42} color={COLORS.textDim} />
              <Text style={styles.emptyText}>
                {showAll ? 'No hay dispositivos emparejados' : 'No hay HC-05 emparejados'}
              </Text>
              <Text style={styles.emptyHint}>
                Empareja tu HC-05 desde los ajustes Bluetooth del teléfono (PIN típico 1234 ó 0000) y vuelve a esta pantalla.
              </Text>
            </View>
          )
        }
      />

      <Text style={styles.footer}>Filtro: HC-05 · HM-10 (próximamente)</Text>
      <Text style={styles.footerStatus}>Estado: {status}{statusDetail ? ` · ${statusDetail}` : ''}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '900', color: COLORS.text, letterSpacing: 2 },
  subtitle: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  connectedCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
    marginHorizontal: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, marginTop: 4, marginBottom: 8,
  },
  connectedLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success },
  connectedLabel: { fontSize: 9, fontWeight: '800', color: COLORS.success, letterSpacing: 2 },
  connectedName: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  disconnectBtn: { backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md },
  disconnectTxt: { fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 1 },
  autoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, marginHorizontal: SPACING.md, marginBottom: 12,
    paddingVertical: 14, borderRadius: RADIUS.pill,
  },
  autoBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 2, color: '#0A0A0A' },
  warn: {
    flexDirection: 'row', gap: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
    padding: SPACING.md, borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.md, marginBottom: 8,
  },
  warnTitle: { fontSize: 13, fontWeight: '700', color: COLORS.warning, marginBottom: 4 },
  warnText: { fontSize: 12, color: COLORS.textSec, lineHeight: 17 },
  warnBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: COLORS.warning, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md },
  warnBtnText: { fontSize: 11, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 4, paddingBottom: 8 },
  listHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  showAllToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  showAllLabel: { fontSize: 10, color: COLORS.textSec, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: COLORS.textSec, letterSpacing: 2 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.md, paddingBottom: 100 },
  deviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: 10,
  },
  deviceCardTarget: {
    borderColor: 'rgba(204,255,0,0.4)',
    backgroundColor: 'rgba(204,255,0,0.04)',
  },
  deviceCardConnected: {
    borderColor: 'rgba(52,211,153,0.5)',
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  deviceCardDim: { opacity: 0.55 },
  deviceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.elevated, alignItems: 'center', justifyContent: 'center' },
  deviceIconTarget: { backgroundColor: 'rgba(204,255,0,0.12)' },
  deviceIconConnected: { backgroundColor: 'rgba(52,211,153,0.15)' },
  deviceBody: { flex: 1 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deviceName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  matchBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(204,255,0,0.14)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  matchText: { fontSize: 9, fontWeight: '800', color: COLORS.accent, letterSpacing: 1 },
  deviceAddr: { fontSize: 11, color: COLORS.textSec, marginTop: 2, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  deviceAction: { width: 32, alignItems: 'center' },
  empty: { alignItems: 'center', padding: 40, paddingTop: 60 },
  emptyText: { fontSize: 15, color: COLORS.textSec, marginTop: 14, fontWeight: '700' },
  emptyHint: { fontSize: 12, color: COLORS.textDim, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  footer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', padding: 12 },
  footerStatus: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', paddingBottom: 12 },
});
