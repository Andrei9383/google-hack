import type { VestSensorData } from '../ble/VestProtocol';
import type { SceneDetection } from '../vision/ObjectFilter';

type ZonePhraseKey = 'center' | 'left' | 'right' | 'center-left' | 'center-right' | 'left-right' | 'all';

const DISPLAY_LABELS: Record<string, string> = {
  person: 'person',
  chair: 'chair',
  table: 'table',
  bicycle: 'bicycle',
  motorcycle: 'motorcycle',
  car: 'car',
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
  'sports ball': 'sports ball',
};

const IRREGULAR_PLURALS: Record<string, string> = {
  person: 'people',
};

const ZONE_PRIORITY = ['center', 'left', 'right'] as const;

function pluralize(label: string, count: number): string {
  if (count === 1) {
    return DISPLAY_LABELS[label] ?? label;
  }

  const singular = DISPLAY_LABELS[label] ?? label;
  return IRREGULAR_PLURALS[singular] ?? `${singular}s`;
}

function zonePhrase(zones: string[]): string {
  const key = zones.join('-') as ZonePhraseKey;

  switch (key) {
    case 'center':
      return 'ahead';
    case 'left':
      return 'to your left';
    case 'right':
      return 'to your right';
    case 'center-left':
      return 'ahead and to the left';
    case 'center-right':
      return 'ahead and to the right';
    case 'left-right':
      return 'to your left and right';
    default:
      return 'around you';
  }
}

export function formatSceneDescription(
  detections: SceneDetection[],
  vest: Pick<VestSensorData, 'left' | 'center' | 'right'>,
): string {
  if (detections.length === 0) {
    return closestObstacleSentence(vest) ?? 'Nothing detected.';
  }

  const cappedDetections = [...detections]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const hiddenCount = Math.max(0, detections.length - cappedDetections.length);

  const grouped = new Map<string, { count: number; zones: Set<string>; topConfidence: number }>();

  for (const detection of cappedDetections) {
    const key = detection.label.toLowerCase();
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.zones.add(detection.zone);
      existing.topConfidence = Math.max(existing.topConfidence, detection.confidence);
      continue;
    }

    grouped.set(key, {
      count: 1,
      zones: new Set([detection.zone]),
      topConfidence: detection.confidence,
    });
  }

  const objectPhrases = [...grouped.entries()]
    .sort((a, b) => {
      const aZones = [...a[1].zones].sort(zoneRank).join('-');
      const bZones = [...b[1].zones].sort(zoneRank).join('-');
      const zoneDelta = zoneRank(aZones.split('-')[0]) - zoneRank(bZones.split('-')[0]);

      if (zoneDelta !== 0) {
        return zoneDelta;
      }

      return b[1].topConfidence - a[1].topConfidence;
    })
    .map(([label, summary]) => {
      const zones = [...summary.zones].sort(zoneRank);
      return `${summary.count} ${pluralize(label, summary.count)} ${zonePhrase(zones)}`;
    });

  const parts: string[] = [];

  if (!cappedDetections.some((detection) => detection.zone === 'center') && vest.center >= 100) {
    parts.push('Clear path ahead');
  }

  if (objectPhrases.length > 0) {
    parts.push(objectPhrases.join(', '));
  }

  if (hiddenCount > 0) {
    parts.push(`and ${hiddenCount} other object${hiddenCount === 1 ? '' : 's'}`);
  }

  const proximity = closestObstacleSentence(vest);

  if (proximity) {
    parts.push(proximity);
  }

  return `${parts.join('. ')}.`;
}

function zoneRank(zone: string): number {
  const index = ZONE_PRIORITY.indexOf(zone as (typeof ZONE_PRIORITY)[number]);
  return index === -1 ? ZONE_PRIORITY.length : index;
}

function closestObstacleSentence(vest: Pick<VestSensorData, 'left' | 'center' | 'right'>): string | null {
  const entries = [
    ['left', vest.left],
    ['center', vest.center],
    ['right', vest.right],
  ] as const;

  const nearest = entries.reduce((current, entry) => (entry[1] < current[1] ? entry : current));

  if (nearest[1] >= 100) {
    return null;
  }

  return `Closest obstacle: ${nearest[1]}cm ${nearest[0]}`;
}