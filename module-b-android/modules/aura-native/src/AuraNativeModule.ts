import { NativeModule, requireNativeModule } from 'expo';

import { AuraNativeModuleEvents, NativeDetectedObject } from './AuraNative.types';

declare class AuraNativeModule extends NativeModule<AuraNativeModuleEvents> {
  detectObjectsAsync(uri: string): Promise<NativeDetectedObject[]>;
  startForegroundServiceAsync(title: string, description: string): Promise<void>;
  stopForegroundServiceAsync(): Promise<void>;
}

export default requireNativeModule<AuraNativeModule>('AuraNative');
