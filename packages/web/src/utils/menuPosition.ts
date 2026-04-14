export interface MenuViewport {
  width: number;
  height: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuAnchorPoint {
  x: number;
  y: number;
}

export interface MenuAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PositionedMenu {
  left: number;
  top: number;
  maxHeight: number;
}

const VIEWPORT_PADDING = 8;
const SUBMENU_GAP = 4;
const MIN_MENU_HEIGHT = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getViewport(): MenuViewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function resolveMaxHeight(viewport: MenuViewport): number {
  return Math.max(MIN_MENU_HEIGHT, viewport.height - VIEWPORT_PADDING * 2);
}

export function positionContextMenu(
  anchor: MenuAnchorPoint,
  menuSize: MenuSize,
  viewport: MenuViewport,
): PositionedMenu {
  const maxLeft = Math.max(VIEWPORT_PADDING, viewport.width - menuSize.width - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewport.height - menuSize.height - VIEWPORT_PADDING);

  return {
    left: clamp(anchor.x, VIEWPORT_PADDING, maxLeft),
    top: clamp(anchor.y, VIEWPORT_PADDING, maxTop),
    maxHeight: resolveMaxHeight(viewport),
  };
}

export function positionCascadeMenu(
  anchor: MenuAnchorRect,
  menuSize: MenuSize,
  viewport: MenuViewport,
): PositionedMenu {
  let left = anchor.right + SUBMENU_GAP;
  if (left + menuSize.width + VIEWPORT_PADDING > viewport.width) {
    left = anchor.left - menuSize.width - SUBMENU_GAP;
  }

  const maxLeft = Math.max(VIEWPORT_PADDING, viewport.width - menuSize.width - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewport.height - menuSize.height - VIEWPORT_PADDING);

  return {
    left: clamp(left, VIEWPORT_PADDING, maxLeft),
    top: clamp(anchor.top, VIEWPORT_PADDING, maxTop),
    maxHeight: resolveMaxHeight(viewport),
  };
}
