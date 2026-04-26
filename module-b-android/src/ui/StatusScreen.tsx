import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AuraZone, VestSensorData } from '../ble/VestProtocol';
import type { OverrideRecord } from '../fusion/SensorFusion';

interface StatusScreenProps {
  auraActive: boolean;
  vestConnected: boolean;
  watchConnected: boolean;
  cameraActive: boolean;
  phoneBatteryLevel: number | null;
  vestBaseUrl: string;
  sensorData: VestSensorData;
  lastOverrides: Partial<Record<AuraZone, OverrideRecord>>;
  lastScene: string;
  lastError: string | null;
  onApplyVestBaseUrl: (baseUrl: string) => void;
  onDescribeNow: () => void;
  onSendVestTest: (zone: AuraZone) => void;
}

export function StatusScreen({
  auraActive,
  vestConnected,
  watchConnected,
  cameraActive,
  phoneBatteryLevel,
  vestBaseUrl,
  sensorData,
  lastOverrides,
  lastScene,
  lastError,
  onApplyVestBaseUrl,
  onDescribeNow,
  onSendVestTest,
}: StatusScreenProps) {
  const [vestBaseUrlDraft, setVestBaseUrlDraft] = useState(vestBaseUrl);
  const lastOverride = mostRecentOverride(lastOverrides);
  const sensorUpdateLabel =
    sensorData.timestamp > 0
      ? `Last board update ${new Date(sensorData.timestamp).toLocaleTimeString()}`
      : 'No vest state received yet.';

  useEffect(() => {
    setVestBaseUrlDraft(vestBaseUrl);
  }, [vestBaseUrl]);

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

        <Text style={styles.inputLabel}>Vest WiFi URL</Text>
        <TextInput
          accessibilityLabel="Vest WiFi URL"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setVestBaseUrlDraft}
          placeholder="http://10.41.x.x:8080"
          placeholderTextColor="#617886"
          style={styles.urlInput}
          value={vestBaseUrlDraft}
        />
        <Pressable
          accessibilityLabel="Apply vest WiFi URL"
          accessibilityRole="button"
          onPress={() => {
            onApplyVestBaseUrl(vestBaseUrlDraft);
          }}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>APPLY VEST URL</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Vest Sensors</Text>
        <Text style={styles.panelSubtitle}>Board-reported values, not camera detections.</Text>
        <Text style={styles.panelHint}>{sensorUpdateLabel}</Text>
        <SensorRow label="LEFT" distance={sensorData.left} />
        <SensorRow label="CENTER" distance={sensorData.center} />
        <SensorRow label="RIGHT" distance={sensorData.right} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Vest Command Ack</Text>
        <Text accessibilityLabel="Last acknowledged vest command" style={styles.sceneText}>
          {lastOverride
            ? `${lastOverride.zone.toUpperCase()} ${lastOverride.record.tier} at ${new Date(lastOverride.record.timestamp).toLocaleTimeString()}`
            : 'No app-triggered vest command acknowledged yet.'}
        </Text>
        <Text style={styles.panelHint}>Use the motor test buttons below to bench-test phone-to-vest commands.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Motor Test</Text>
        <Text style={styles.panelSubtitle}>Sends a direct bench-test command to the vest.</Text>
        <View style={styles.testRow}>
          <Pressable
            accessibilityLabel="Test left motor"
            accessibilityRole="button"
            onPress={() => {
              onSendVestTest('left');
            }}
            style={styles.testButton}
          >
            <Text style={styles.testButtonText}>TEST LEFT</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Test center motors"
            accessibilityRole="button"
            onPress={() => {
              onSendVestTest('center');
            }}
            style={styles.testButton}
          >
            <Text style={styles.testButtonText}>TEST CENTER</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Test right motor"
            accessibilityRole="button"
            onPress={() => {
              onSendVestTest('right');
            }}
            style={styles.testButton}
          >
            <Text style={styles.testButtonText}>TEST RIGHT</Text>
          </Pressable>
        </View>
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

function mostRecentOverride(lastOverrides: Partial<Record<AuraZone, OverrideRecord>>) {
  let latest: { zone: AuraZone; record: OverrideRecord } | null = null;

  for (const zone of Object.keys(lastOverrides) as AuraZone[]) {
    const record = lastOverrides[zone];

    if (!record) {
      continue;
    }

    if (!latest || record.timestamp > latest.record.timestamp) {
      latest = { zone, record };
    }
  }

  return latest;
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
  inputLabel: {
    color: '#cfe0eb',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
  },
  urlInput: {
    backgroundColor: '#08131b',
    borderColor: '#173243',
    borderRadius: 14,
    borderWidth: 1,
    color: '#f6fbff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: '#2f4f61',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryActionText: {
    color: '#d8e5ee',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
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
  panelSubtitle: {
    color: '#8ca2b3',
    fontSize: 13,
    marginTop: -8,
    marginBottom: 6,
  },
  panelHint: {
    color: '#8ca2b3',
    fontSize: 12,
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
  testRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testButton: {
    alignItems: 'center',
    backgroundColor: '#10202b',
    borderColor: '#2fd08c',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  testButtonText: {
    color: '#d8e5ee',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
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