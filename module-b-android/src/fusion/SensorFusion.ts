import type { AuraZone, HapticIntent, HapticTier, VestSensorData } from '../ble/VestProtocol';
import { buildHapticPayload, type HapticCommand } from '../ble/VestProtocol';
import { byPriorityThenConfidence, type SceneDetection } from '../vision/ObjectFilter';

export interface OverrideRecord {
  tier: HapticIntent;
  intensity: number;
  pattern: number;
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
const COMMAND_RESEND_INTERVAL_MS = 900;
const CLEAR_DISTANCE_CM = 220;
const APPROACHING_DISTANCE_CM = 160;
const NEAR_DISTANCE_CM = 90;
const DANGER_DISTANCE_CM = 40;
const tierPriority: Record<HapticIntent, number> = {
  CLEAR: 0,
  STATIC: 1,
  DYNAMIC: 2,
  DANGER: 3,
};

export function fuseSensorData(input: FusionInput): FusionOutput {
  const overrides: Array<HapticCommand & { payload: Uint8Array }> = [];
  const now = input.now ?? Date.now();

  for (const zone of ZONES) {
    const vestDistance = input.vest[zone];
    const sonarCommand = commandForDistance(zone, vestDistance);
    const topDetection = input.mlkit
      .filter((detection) => detection.zone === zone)
      .sort(byPriorityThenConfidence)[0];
    const command = topDetection
      ? strongerCommand(sonarCommand, commandForVision(zone, topDetection.tier, vestDistance))
      : sonarCommand;

    if (!shouldSendCommand(command, input.previousOverrides?.[zone], now)) {
      continue;
    }

    overrides.push(withPayload(command));
  }

  return {
    hapticOverrides: overrides,
    sceneObjects: [...input.mlkit].sort(byPriorityThenConfidence),
  };
}

function commandForDistance(zone: AuraZone, distanceCm: number): HapticCommand {
  if (distanceCm >= CLEAR_DISTANCE_CM) {
    return { zone, tier: 'CLEAR', intensity: 0x00, pattern: 0x00 };
  }

  if (distanceCm >= APPROACHING_DISTANCE_CM) {
    return { zone, tier: 'STATIC', intensity: 0x46, pattern: 0x00 };
  }

  if (distanceCm >= NEAR_DISTANCE_CM) {
    return { zone, tier: 'STATIC', intensity: 0x70, pattern: 0x00 };
  }

  if (distanceCm >= DANGER_DISTANCE_CM) {
    return { zone, tier: 'DYNAMIC', intensity: 0xb0, pattern: 0x01 };
  }

  return { zone, tier: 'DANGER', intensity: 0xff, pattern: 0x02 };
}

function commandForVision(zone: AuraZone, tier: HapticTier, vestDistance: number): HapticCommand {
  if (tier === 'DANGER') {
    return { zone, tier: 'DANGER', intensity: 0xff, pattern: 0x02 };
  }

  if (tier === 'DYNAMIC') {
    return { zone, tier: 'DYNAMIC', intensity: 0xb0, pattern: 0x01 };
  }

  const intensity = vestDistance >= CLEAR_DISTANCE_CM ? 0x46 : 0x70;

  return { zone, tier: 'STATIC', intensity, pattern: 0x00 };
}

function strongerCommand(a: HapticCommand, b: HapticCommand): HapticCommand {
  if (tierPriority[b.tier] !== tierPriority[a.tier]) {
    return tierPriority[b.tier] > tierPriority[a.tier] ? b : a;
  }

  return b.intensity > a.intensity ? b : a;
}

function shouldSendCommand(
  command: HapticCommand,
  lastOverride: OverrideRecord | undefined,
  now: number,
): boolean {
  if (!lastOverride) {
    return true;
  }

  const sameCommand =
    lastOverride.tier === command.tier &&
    lastOverride.intensity === command.intensity &&
    lastOverride.pattern === command.pattern;

  return !sameCommand || now - lastOverride.timestamp >= COMMAND_RESEND_INTERVAL_MS;
}

function withPayload(command: HapticCommand): HapticCommand & { payload: Uint8Array } {
  return {
    ...command,
    payload: buildHapticPayload(command.zone, command.intensity, command.pattern),
  };
}
