import { useCameraPermissions } from 'expo-camera';
import { useEffect, useState, type ReactNode } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface PermissionsGateProps {
  children: (state: { cameraGranted: boolean }) => ReactNode;
}

export function PermissionsGate({ children }: PermissionsGateProps) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [bleGranted, setBleGranted] = useState(Platform.OS !== 'android');
  const [cameraBypassEnabled, setCameraBypassEnabled] = useState(false);

  useEffect(() => {
    void requestPermissions();
  }, []);

  const cameraGranted = cameraPermission?.granted ?? false;

  if (!bleGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Aura Setup Required</Text>
        <Text style={styles.body}>
          Bluetooth permissions are required to connect to the vest and watch.
        </Text>
        <Pressable
          accessibilityLabel="Grant Bluetooth permissions"
          accessibilityRole="button"
          onPress={() => {
            void requestPermissions();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Grant Bluetooth Access</Text>
        </Pressable>
      </View>
    );
  }

  if (!cameraPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraGranted && cameraPermission.canAskAgain && !cameraBypassEnabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera Access Needed</Text>
        <Text style={styles.body}>
          Aura can still provide haptics without the camera, but scene descriptions require it.
        </Text>
        <Pressable
          accessibilityLabel="Grant camera permission"
          accessibilityRole="button"
          onPress={() => {
            void requestCameraPermission();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Continue without camera"
          accessibilityRole="button"
          onPress={() => {
            setCameraBypassEnabled(true);
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Continue In Haptic-Only Mode</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children({ cameraGranted })}</>;

  async function requestPermissions() {
    if (Platform.OS === 'android') {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ].filter(Boolean);

      const result = await PermissionsAndroid.requestMultiple(permissions);
      const isGranted = Object.values(result).every(
        (value) => value === PermissionsAndroid.RESULTS.GRANTED,
      );
      setBleGranted(isGranted);
    }

    await requestCameraPermission();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08121a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#f7fbff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: '#c5d4df',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#25b374',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: '100%',
  },
  buttonText: {
    color: '#04140d',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButton: {
    borderColor: '#3d5565',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: '100%',
  },
  secondaryButtonText: {
    color: '#c5d4df',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});