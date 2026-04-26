import { VISION_CONFIDENCE_THRESHOLD } from '../ble/constants';
import type { AuraZone, HapticTier } from '../ble/VestProtocol';
import type { NativeDetectedObject } from '../native/AuraNative';
import { classifyBoundingBox } from './ZoneClassifier';

export interface SceneDetection extends NativeDetectedObject {
  zone: AuraZone;
  tier: HapticTier;
}

const GENERIC_LABELS = new Set(['fashion good', 'home good', 'object', 'unknown']);
const ALWAYS_IGNORED_LABELS = new Set(['selfie']);
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
const SMALL_OBJECT_LABELS = new Set([
  'bottle',
  'bowl',
  'cat',
  'coffee cup',
  'cup',
  'cutlery',
  'dish',
  'drinkware',
  'fork',
  'glass',
  'knife',
  'musical instrument',
  'plate',
  'spoon',
  'tableware',
  'wine glass',
]);

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
  frameHeight = frameWidth,
): SceneDetection[] {
  return detections
    .map(withBestAvailableLabel)
    .filter((detection) => detection.label.trim().length > 0)
    .filter((detection) => isUsableBox(detection.boundingBox, frameWidth, frameHeight))
    .map((detection) => withNavigationFallback(detection, frameWidth, frameHeight))
    .filter((detection) => isActionableLabel(detection.label))
    .filter((detection) => detection.confidence >= VISION_CONFIDENCE_THRESHOLD)
    .filter((detection) => isNavigationRelevantDetection(detection, frameWidth, frameHeight))
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

function withNavigationFallback(
  detection: NativeDetectedObject,
  frameWidth: number,
  frameHeight: number,
): NativeDetectedObject {
  if (!GENERIC_LABELS.has(normalizeLabel(detection.label))) {
    return detection;
  }

  if (!isLargeNavigationBox(detection.boundingBox, frameWidth, frameHeight)) {
    return detection;
  }

  return {
    ...detection,
    label: 'obstacle',
  };
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function isActionableLabel(label: string): boolean {
  const normalized = normalizeLabel(label);

  return (
    !GENERIC_LABELS.has(normalized) &&
    !ALWAYS_IGNORED_LABELS.has(normalized) &&
    !SCENE_ONLY_LABELS.has(normalized)
  );
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

function isNavigationRelevantDetection(
  detection: NativeDetectedObject,
  frameWidth: number,
  frameHeight: number,
): boolean {
  const metrics = boxMetrics(detection.boundingBox, frameWidth, frameHeight);

  if (metrics.areaRatio <= 0 || metrics.widthRatio <= 0 || metrics.heightRatio <= 0) {
    return false;
  }

  const label = normalizeLabel(detection.label);

  if (SMALL_OBJECT_LABELS.has(label)) {
    return metrics.areaRatio >= 0.12 || (metrics.bottomRatio >= 0.7 && metrics.areaRatio >= 0.06);
  }

  return isLargeNavigationBox(detection.boundingBox, frameWidth, frameHeight);
}

function isLargeNavigationBox(
  box: NativeDetectedObject['boundingBox'],
  frameWidth: number,
  frameHeight: number,
): boolean {
  const metrics = boxMetrics(box, frameWidth, frameHeight);

  return (
    metrics.areaRatio >= 0.055 ||
    (metrics.heightRatio >= 0.28 && metrics.widthRatio >= 0.08) ||
    (metrics.bottomRatio >= 0.58 && metrics.areaRatio >= 0.025)
  );
}

function boxMetrics(
  box: NativeDetectedObject['boundingBox'],
  frameWidth: number,
  frameHeight: number,
) {
  const safeWidth = Math.max(frameWidth, 1);
  const safeHeight = Math.max(frameHeight, 1);
  const widthRatio = Math.max(0, box.width) / safeWidth;
  const heightRatio = Math.max(0, box.height) / safeHeight;
  const areaRatio = widthRatio * heightRatio;
  const bottomRatio = (box.y + box.height) / safeHeight;

  return {
    areaRatio,
    bottomRatio,
    heightRatio,
    widthRatio,
  };
}
