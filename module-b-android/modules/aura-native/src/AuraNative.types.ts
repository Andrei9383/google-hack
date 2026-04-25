import type { StyleProp, ViewStyle } from 'react-native';

export type NativeBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeDetectedObject = {
  label: string;
  confidence: number;
  boundingBox: NativeBoundingBox;
  alternativeLabels?: NativeDetectionLabel[];
};

export type NativeDetectionLabel = {
  text: string;
  confidence: number;
};

export type AuraNativeModuleEvents = Record<string, never>;

export type OnLoadEventPayload = {
  url: string;
};

export type AuraNativeViewProps = {
  url: string;
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
