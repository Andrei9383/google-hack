import type { AuraZone, HapticTier, VestSensorData } from '../ble/VestProtocol';
import { buildHapticOverride, type HapticCommand } from '../ble/VestProtocol';
import { byPriorityThenConfidence, type SceneDetection } from '../vision/ObjectFilter';

export interface OverrideRecord {
  tier: HapticTier;
  timestamp: number;
}

export interface FusionInput {
  vest: Pick<VestSensorData, 'left' | 'center' | 'right'>;
  mlkit: SceneDetection[];
  previousOverrides?: Partial<Record<AuraZone, OverrideRecord>>;
  now?: number;
}

export interface FusionOutput {
  hapticOverrides: Array<HapticCommand & { payload: Uint8Array }>;
  sceneObjects: SceneDetection[];
}

const ZONES: AuraZone[] = ['left', 'center', 'right'];

export function fuseSensorData(input: FusionInput): FusionOutput {
  const overrides: Array<HapticCommand & { payload: Uint8Array }> = [];
  const now = input.now ?? Date.now();

  for (const zone of ZONES) {
    const vestDistance = input.vest[zone];
    const topDetection = input.mlkit
      .filter((detection) => detection.zone === zone)
      .sort(byPriorityThenConfidence)[0];

    if (!topDetection) {
      continue;
    }

    if (vestDistance < 20 && topDetection.tier === 'DANGER') {
      continue;
    }

    if (vestDistance > 200 && topDetection.tier !== 'DANGER') {
      continue;
    }

    const lastOverride = input.previousOverrides?.[zone];

    if (lastOverride && lastOverride.tier === topDetection.tier && now - lastOverride.timestamp < 500) {
      continue;
    }

    overrides.push({
      zone,
      tier: topDetection.tier,
      payload: buildHapticOverride(zone, topDetection.tier),
    });
  }

  return {
    hapticOverrides: overrides,
    sceneObjects: [...input.mlkit].sort(byPriorityThenConfidence),
  };
}