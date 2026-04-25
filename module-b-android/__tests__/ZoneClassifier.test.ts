/// <reference types="jest" />

import { classifyBoundingBox, classifyZone } from '../src/vision/ZoneClassifier';

describe('ZoneClassifier', () => {
  it('classifies center points into thirds', () => {
    expect(classifyZone(10, 100)).toBe('left');
    expect(classifyZone(50, 100)).toBe('center');
    expect(classifyZone(90, 100)).toBe('right');
  });

  it('classifies bounding boxes by center x', () => {
    expect(classifyBoundingBox({ x: 0, y: 0, width: 20, height: 20 }, 100)).toBe('left');
    expect(classifyBoundingBox({ x: 35, y: 0, width: 20, height: 20 }, 100)).toBe('center');
    expect(classifyBoundingBox({ x: 75, y: 0, width: 20, height: 20 }, 100)).toBe('right');
  });
});