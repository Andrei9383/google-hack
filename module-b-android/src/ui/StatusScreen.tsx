import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { VestSensorData } from '../ble/VestProtocol';

interface StatusScreenProps {
  auraActive: boolean;
  vestConnected: boolean;
  watchConnected: boolean;
  cameraActive: boolean;
  phoneBatteryLevel: number | null;
  sensorData: VestSensorData;
  lastScene: string;
  lastError: string | null;
  onConnectBoard: () => void;
  onDescribeNow: () => void;
}

export function StatusScreen({
  auraActive,
  vestConnected,
  watchConnected,
  cameraActive,
  phoneBatteryLevel,
  sensorData,
  lastScene,
  lastError,
  onConnectBoard,
  onDescribeNow,
}: StatusScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text accessibilityLabel="Aura active status" style={styles.heroTitle}>
              {auraActive ? 'AURA ACTIVE' : 'AURA PAUSED'}
            </Text>
            <Text style={styles.heroSubtitle}>Spatial awareness and assisted readout</Text>
          </View>
          <Text accessibilityLabel="Phone battery percentage" style={styles.heroBattery}>
            {phoneBatteryLevel === null ? '--%' : `${phoneBatteryLevel}%`}
          </Text>
        </View>

        <StatusRow label="Vest" connected={vestConnected} />
        <StatusRow label="Watch" connected={watchConnected} />
        <StatusRow label="Camera" connected={cameraActive} />
        <Pressable
          accessibilityLabel="Connect Aura board"
          accessibilityRole="button"
          onPress={onConnectBoard}
          style={[styles.connectButton, vestConnected ? styles.connectedButton : null]}
        >
          <Text style={[styles.connectButtonText, vestConnected ? styles.connectedButtonText : null]}>
            {vestConnected ? 'BOARD CONNECTED' : 'CONNECT BOARD'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Live Distance</Text>
        <SensorRow label="LEFT" distance={sensorData.left} />
        <SensorRow label="CENTER" distance={sensorData.center} />
        <SensorRow label="RIGHT" distance={sensorData.right} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Last Scene</Text>
        <Text accessibilityLabel="Last spoken scene description" style={styles.sceneText}>
          {lastScene}
        </Text>
      </View>

      {lastError ? (
        <View style={styles.errorCard}>
          <Text accessibilityLabel="Latest system error" style={styles.errorText}>
            {lastError}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel="Describe scene now"
        accessibilityRole="button"
        onPress={onDescribeNow}
        style={styles.button}
      >
        <Text style={styles.buttonText}>DESCRIBE SCENE NOW</Text>
      </Pressable>
    </ScrollView>
  );
}

function StatusRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={[styles.statusDot, connected ? styles.connectedDot : styles.disconnectedDot]} />
      <Text style={styles.statusValue}>{connected ? 'Connected' : 'Unavailable'}</Text>
    </View>
  );
}

function SensorRow({ label, distance }: { label: string; distance: number }) {
  const normalized = Math.max(0, Math.min(1, 1 - distance / 255));
  const readableDistance = distance >= 0xff ? 'clear' : `${distance}cm`;

  return (
    <View style={styles.sensorRow}>
      <Text accessibilityLabel={`${label} sensor label`} style={styles.sensorLabel}>
        {label}
      </Text>
      <View style={styles.sensorBarTrack}>
        <View style={[styles.sensorBarFill, { width: `${Math.max(normalized * 100, 4)}%` }]} />
      </View>
      <Text accessibilityLabel={`${label} sensor distance ${readableDistance}`} style={styles.sensorDistance}>
        {readableDistance}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  heroCard: {
    backgroundColor: '#0d1a23',
    borderColor: '#173243',
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroTitle: {
    color: '#f6fbff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroSubtitle: {
    color: '#8ca2b3',
    fontSize: 14,
    marginTop: 8,
  },
  heroBattery: {
    color: '#7ef0b6',
    fontSize: 18,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statusLabel: {
    color: '#d8e5ee',
    fontSize: 16,
    fontWeight: '600',
    width: 80,
  },
  statusDot: {
    borderRadius: 999,
    height: 12,
    marginRight: 12,
    width: 12,
  },
  connectedDot: {
    backgroundColor: '#2fd08c',
  },
  disconnectedDot: {
    backgroundColor: '#f26b5e',
  },
  statusValue: {
    color: '#b7c8d5',
    fontSize: 15,
  },
  connectButton: {
    alignItems: 'center',
    borderColor: '#2fd08c',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  connectedButton: {
    borderColor: '#315365',
  },
  connectButtonText: {
    color: '#7ef0b6',
    fontSize: 14,
    fontWeight: '800',
  },
  connectedButtonText: {
    color: '#9db1bd',
  },
  panel: {
    backgroundColor: '#0a141b',
    borderColor: '#173243',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  panelTitle: {
    color: '#f6fbff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  sensorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  sensorLabel: {
    color: '#cfe0eb',
    fontSize: 15,
    fontWeight: '700',
    width: 68,
  },
  sensorBarTrack: {
    backgroundColor: '#10202b',
    borderRadius: 999,
    flex: 1,
    height: 10,
    overflow: 'hidden',
  },
  sensorBarFill: {
    backgroundColor: '#f6c445',
    borderRadius: 999,
    height: '100%',
  },
  sensorDistance: {
    color: '#d8e5ee',
    fontSize: 14,
    marginLeft: 12,
    textAlign: 'right',
    width: 64,
  },
  sceneText: {
    color: '#d8e5ee',
    fontSize: 16,
    lineHeight: 24,
  },
  errorCard: {
    backgroundColor: '#3b1f22',
    borderColor: '#8f4d54',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  errorText: {
    color: '#ffd6d3',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#25b374',
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  buttonText: {
    color: '#04140d',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
