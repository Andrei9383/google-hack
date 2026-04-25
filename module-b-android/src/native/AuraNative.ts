import { requireOptionalNativeModule } from 'expo-modules-core';

export interface NativeBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeDetectedObject {
  label: string;
  confidence: number;
  boundingBox: NativeBoundingBox;
  alternativeLabels?: NativeDetectionLabel[];
}

export interface NativeDetectionLabel {
  text: string;
  confidence: number;
}

interface AuraNativeModuleShape {
  detectObjectsAsync(uri: string): Promise<NativeDetectedObject[]>;
  startForegroundServiceAsync(title: string, description: string): Promise<void>;
  stopForegroundServiceAsync(): Promise<void>;
}

const AuraNativeModule = requireOptionalNativeModule<AuraNativeModuleShape>('AuraNative');

export const hasNativeAuraModule = Boolean(AuraNativeModule);

export async function detectObjectsAsync(uri: string): Promise<NativeDetectedObject[]> {
  if (!AuraNativeModule?.detectObjectsAsync) {
    return [];
  }

  return AuraNativeModule.detectObjectsAsync(uri);
}

export async function startForegroundServiceAsync(title: string, description: string) {
  if (!AuraNativeModule?.startForegroundServiceAsync) {
    return;
  }

  await AuraNativeModule.startForegroundServiceAsync(title, description);
}

export async function stopForegroundServiceAsync() {
  if (!AuraNativeModule?.stopForegroundServiceAsync) {
    return;
  }

  await AuraNativeModule.stopForegroundServiceAsync();
}
