import { VISION_CONFIDENCE_THRESHOLD } from '../ble/constants';
import type { AuraZone, HapticTier } from '../ble/VestProtocol';
import type { NativeDetectedObject } from '../native/AuraNative';
import { classifyBoundingBox } from './ZoneClassifier';

export interface SceneDetection extends NativeDetectedObject {
  zone: AuraZone;
  tier: HapticTier;
}

const GENERIC_LABELS = new Set(['fashion good', 'home good', 'object', 'unknown']);
const SCENE_ONLY_LABELS = new Set([
  'atmosphere',
  'ceiling',
  'cloud',
  'daytime',
  'floor',
  'horizon',
  'lighting',
  'room',
  'running',
  'sky',
  'sitting',
  'standing',
  'wall',
  'walking',
]);
const DANGER_LABELS = new Set(['person', 'bicycle', 'motorcycle', 'car']);
const DYNAMIC_LABELS = new Set(['dog', 'cat', 'bird', 'sports ball', 'animal']);

const tierPriority: Record<HapticTier, number> = {
  DANGER: 3,
  DYNAMIC: 2,
  STATIC: 1,
};

export function classifyTier(label: string): HapticTier {
  const normalized = label.trim().toLowerCase();

  if (DANGER_LABELS.has(normalized)) {
    return 'DANGER';
  }

  if (DYNAMIC_LABELS.has(normalized)) {
    return 'DYNAMIC';
  }

  return 'STATIC';
}

export function filterDetections(
  detections: NativeDetectedObject[],
  frameWidth: number,
  frameHeight = Number.MAX_SAFE_INTEGER,
): SceneDetection[] {
  return detections
    .map(withBestAvailableLabel)
    .filter((detection) => detection.label.trim().length > 0)
    .filter((detection) => isActionableLabel(detection.label))
    .filter((detection) => detection.confidence >= VISION_CONFIDENCE_THRESHOLD)
    .filter((detection) => isUsableBox(detection.boundingBox, frameWidth, frameHeight))
    .map((detection) => ({
      ...detection,
      tier: classifyTier(detection.label),
      zone: classifyBoundingBox(detection.boundingBox, frameWidth),
    }))
    .sort(byPriorityThenConfidence);
}

function isUsableBox(
  box: NativeDetectedObject['boundingBox'],
  frameWidth: number,
  frameHeight: number,
): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x < frameWidth &&
    box.y < frameHeight &&
    box.x + box.width > 0 &&
    box.y + box.height > 0
  );
}

function withBestAvailableLabel(detection: NativeDetectedObject): NativeDetectedObject {
  const alternatives = detection.alternativeLabels ?? [];
  const currentLabel = normalizeLabel(detection.label);

  if (isActionableLabel(currentLabel)) {
    return {
      ...detection,
      label: readableLabel(detection.label),
    };
  }

  const detailedLabel = alternatives
    .filter((label) => isActionableLabel(label.text))
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!detailedLabel) {
    return detection;
  }

  return {
    ...detection,
    confidence: detailedLabel.confidence,
    label: readableLabel(detailedLabel.text),
  };
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function isActionableLabel(label: string): boolean {
  const normalized = normalizeLabel(label);

  return !GENERIC_LABELS.has(normalized) && !SCENE_ONLY_LABELS.has(normalized);
}

function readableLabel(label: string): string {
  return normalizeLabel(label).replace(/\s+/g, ' ');
}

export function byPriorityThenConfidence(a: SceneDetection, b: SceneDetection): number {
  const priorityDelta = tierPriority[b.tier] - tierPriority[a.tier];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return b.confidence - a.confidence;
}
