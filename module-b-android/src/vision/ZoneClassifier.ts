import type { AuraZone } from '../ble/VestProtocol';
import type { NativeBoundingBox } from '../native/AuraNative';

export function classifyZone(centerX: number, frameWidth: number): AuraZone {
  const leftBoundary = frameWidth * 0.33;
  const rightBoundary = frameWidth * 0.66;

  if (centerX < leftBoundary) {
    return 'left';
  }

  if (centerX > rightBoundary) {
    return 'right';
  }

  return 'center';
}

export function classifyBoundingBox(box: NativeBoundingBox, frameWidth: number): AuraZone {
  return classifyZone(box.x + box.width / 2, frameWidth);
}