import { registerWebModule, NativeModule } from 'expo';

import type { AuraNativeModuleEvents, NativeDetectedObject } from './AuraNative.types';

class AuraNativeModule extends NativeModule<AuraNativeModuleEvents> {
  async detectObjectsAsync(_uri: string): Promise<NativeDetectedObject[]> {
    return [];
  }

  async startForegroundServiceAsync(): Promise<void> {
    return;
  }

  async stopForegroundServiceAsync(): Promise<void> {
    return;
  }
}

export default registerWebModule(AuraNativeModule, 'AuraNative');
