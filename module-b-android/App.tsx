import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';

import { useAuraSystem } from './src/app/useAuraSystem';
import { useSystemStore } from './src/state/SystemStore';
import { PermissionsGate } from './src/ui/PermissionsGate';
import { StatusScreen } from './src/ui/StatusScreen';
import { CameraProcessor } from './src/vision/CameraProcessor';

function AuraShell({ cameraGranted }: { cameraGranted: boolean }) {
  const system = useSystemStore();
  const { describeSceneNow, handleVisionDetections, handleVisionError } = useAuraSystem(
    cameraGranted,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {cameraGranted ? (
          <CameraProcessor
            enabled={cameraGranted}
            onDetections={handleVisionDetections}
            onError={handleVisionError}
            style={styles.cameraPreview}
          />
        ) : null}
        <StatusScreen
          auraActive
          vestConnected={system.vestConnected}
          watchConnected={system.watchConnected}
          cameraActive={system.cameraActive}
          phoneBatteryLevel={system.phoneBatteryLevel}
          vestBaseUrl={system.vestBaseUrl}
          sensorData={system.vestSensorData}
          lastScene={system.lastScene}
          lastError={system.lastError}
          onApplyVestBaseUrl={system.setVestBaseUrl}
          onDescribeNow={describeSceneNow}
        />
        <StatusBar style="light" />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return <PermissionsGate>{({ cameraGranted }) => <AuraShell cameraGranted={cameraGranted} />}</PermissionsGate>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08121a',
  },
  container: {
    flex: 1,
    backgroundColor: '#08121a',
  },
  cameraPreview: {
    height: 180,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 24,
    overflow: 'hidden',
  },
});
