import { CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useEventCallback } from '../app/useEventCallback';
import { detectObjectsAsync, type NativeDetectedObject } from '../native/AuraNative';
import type { SceneDetection } from './ObjectFilter';

interface CameraProcessorProps {
  enabled: boolean;
  detections?: SceneDetection[];
  onDetections: (
    detections: NativeDetectedObject[],
    frameWidth: number,
    frameHeight: number,
  ) => void | Promise<void>;
  onError: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}

const INITIAL_CAPTURE_DELAY_MS = 900;
const CAPTURE_INTERVAL_MS = 1400;

export function CameraProcessor({
  enabled,
  detections = [],
  onDetections,
  onError,
  style,
}: CameraProcessorProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });
  const [layoutSize, setLayoutSize] = useState({ width: 1, height: 1 });
  const handleDetections = useEventCallback(onDetections);
  const handleError = useEventCallback(onError);

  useEffect(() => {
    if (!enabled || !ready) {
      return;
    }

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const capture = async () => {
      if (cancelled || !cameraRef.current) {
        return;
      }

      try {
        const picture = await cameraRef.current.takePictureAsync({
          quality: 0.6,
          skipProcessing: true,
        });

        if (picture?.uri) {
          const detections = await detectObjectsAsync(picture.uri);
          await handleDetections(detections, picture.width, picture.height);
          setFrameSize({
            width: Math.max(picture.width, 1),
            height: Math.max(picture.height, 1),
          });
        }
      } catch (error) {
        handleError(error instanceof Error ? error.message : 'Camera processing failed.');
      } finally {
        if (!cancelled) {
          timeoutHandle = setTimeout(capture, CAPTURE_INTERVAL_MS);
        }
      }
    };

    timeoutHandle = setTimeout(capture, INITIAL_CAPTURE_DELAY_MS);

    return () => {
      cancelled = true;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, handleDetections, handleError, ready]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayoutSize({ width: Math.max(width, 1), height: Math.max(height, 1) });
  };

  return (
    <View style={[styles.wrapper, style, expanded ? styles.expandedWrapper : null]} onLayout={handleLayout}>
      <CameraView
        animateShutter={false}
        facing="back"
        onCameraReady={() => {
          setReady(true);
        }}
        ref={cameraRef}
        style={styles.camera}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {detections.slice(0, 5).map((detection, index) => (
          <DetectionTag
            detection={detection}
            frameSize={frameSize}
            index={index}
            key={`${detection.label}-${index}-${detection.zone}`}
            layoutSize={layoutSize}
          />
        ))}
      </View>
      <Pressable
        accessibilityLabel={expanded ? 'Shrink camera preview' : 'Expand camera preview'}
        accessibilityRole="button"
        onPress={() => {
          setExpanded((current) => !current);
        }}
        style={styles.previewButton}
      >
        <Text style={styles.previewButtonText}>{expanded ? 'SHRINK' : 'EXPAND'}</Text>
      </Pressable>
    </View>
  );
}

function DetectionTag({
  detection,
  frameSize,
  index,
  layoutSize,
}: {
  detection: SceneDetection;
  frameSize: { width: number; height: number };
  index: number;
  layoutSize: { width: number; height: number };
}) {
  const left = (detection.boundingBox.x / frameSize.width) * layoutSize.width;
  const top = (detection.boundingBox.y / frameSize.height) * layoutSize.height;
  const width = (detection.boundingBox.width / frameSize.width) * layoutSize.width;
  const height = (detection.boundingBox.height / frameSize.height) * layoutSize.height;
  const confidence = Math.round(detection.confidence * 100);

  return (
    <View
      style={[
        styles.detectionBox,
        {
          height: Math.max(height, 36),
          left: Math.max(4, Math.min(left, layoutSize.width - 84)),
          top: Math.max(4, Math.min(top, layoutSize.height - 44 - index * 2)),
          width: Math.max(width, 84),
        },
      ]}
    >
      <Text numberOfLines={1} style={styles.detectionLabel}>
        {detection.label} {confidence}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#10202b',
  },
  expandedWrapper: {
    height: 340,
  },
  camera: {
    flex: 1,
  },
  detectionBox: {
    borderColor: '#7ef0b6',
    borderRadius: 8,
    borderWidth: 2,
    position: 'absolute',
  },
  detectionLabel: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(4, 20, 13, 0.82)',
    borderBottomRightRadius: 6,
    color: '#f6fbff',
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 150,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  previewButton: {
    backgroundColor: 'rgba(4, 20, 13, 0.84)',
    borderColor: '#2fd08c',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
    right: 10,
  },
  previewButtonText: {
    color: '#f6fbff',
    fontSize: 12,
    fontWeight: '800',
  },
});
