import { describe, expect, it } from 'vitest';
import { positionCascadeMenu, positionContextMenu } from './menuPosition';

describe('menuPosition', () => {
  it('keeps the main menu inside the viewport near the bottom-right corner', () => {
    const positioned = positionContextMenu(
      { x: 1200, y: 760 },
      { width: 220, height: 360 },
      { width: 1280, height: 800 },
    );

    expect(positioned.left).toBe(1052);
    expect(positioned.top).toBe(432);
    expect(positioned.maxHeight).toBe(784);
  });

  it('clamps the main menu away from the top-left edges on small screens', () => {
    const positioned = positionContextMenu(
      { x: -20, y: -40 },
      { width: 180, height: 240 },
      { width: 320, height: 480 },
    );

    expect(positioned.left).toBe(8);
    expect(positioned.top).toBe(8);
    expect(positioned.maxHeight).toBe(464);
  });

  it('opens cascade menus to the left when the right side would overflow', () => {
    const positioned = positionCascadeMenu(
      { left: 980, top: 120, right: 1150, bottom: 160 },
      { width: 180, height: 280 },
      { width: 1280, height: 720 },
    );

    expect(positioned.left).toBe(796);
    expect(positioned.top).toBe(120);
    expect(positioned.maxHeight).toBe(704);
  });

  it('repositions cascade menus vertically when they would overflow the bottom edge', () => {
    const positioned = positionCascadeMenu(
      { left: 200, top: 640, right: 360, bottom: 680 },
      { width: 180, height: 220 },
      { width: 1024, height: 768 },
    );

    expect(positioned.left).toBe(364);
    expect(positioned.top).toBe(540);
    expect(positioned.maxHeight).toBe(752);
  });
});
