import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize, primaryMonitor } from '@tauri-apps/api/window';

export const WIDGET_LABEL = 'mlt-widget';
export const CONTEXT_BAR_LABEL = 'mlt-context-bar';

export type WidgetDisplayMode = 'overlay' | 'pin';

const WIDGET_WIDTH = 300;
const WIDGET_HEIGHT = 420;

/** Create or show the compact desktop widget window (Tauri only). */
export async function ensureWidgetWindow(
  mode: WidgetDisplayMode = 'overlay',
): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(WIDGET_LABEL);
  if (existing) {
    await applyWidgetMode(existing, mode);
    await existing.show();
    await existing.setFocus();
    return existing;
  }

  const w = new WebviewWindow(WIDGET_LABEL, {
    url: 'index.html?mlt=widget',
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    minWidth: 260,
    minHeight: 280,
    maxWidth: 400,
    resizable: true,
    decorations: false,
    transparent: true,
    alwaysOnTop: mode === 'overlay',
    skipTaskbar: true,
    title: 'My Little Todo — Widget',
  });

  await new Promise((r) => setTimeout(r, 300));

  await applyWidgetMode(w, mode);
  try {
    const mon = await primaryMonitor();
    if (mon) {
      const { size, position } = mon;
      const x = position.x + size.width - WIDGET_WIDTH - 16;
      const y = position.y + size.height - WIDGET_HEIGHT - 48;
      await w.setPosition(new PhysicalPosition(x, y));
      await w.setSize(new PhysicalSize(WIDGET_WIDTH, WIDGET_HEIGHT));
    }
  } catch {
    /* */
  }

  await w.show();
  await w.setFocus();
  return w;
}

export async function applyWidgetMode(win: WebviewWindow, mode: WidgetDisplayMode): Promise<void> {
  await win.setAlwaysOnTop(mode === 'overlay');
}

export async function closeWidgetWindow(): Promise<void> {
  const w = await WebviewWindow.getByLabel(WIDGET_LABEL);
  if (w) await w.close();
}

/** Thin strip for role + task summary (optional second window). */
export async function ensureContextBarWindow(): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(CONTEXT_BAR_LABEL);
  if (existing) {
    await existing.show();
    return existing;
  }

  const w = new WebviewWindow(CONTEXT_BAR_LABEL, {
    url: 'index.html?mlt=context-bar',
    width: 480,
    height: 44,
    minHeight: 36,
    maxHeight: 120,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'My Little Todo — Context',
  });

  await new Promise((r) => setTimeout(r, 300));

  try {
    const mon = await primaryMonitor();
    if (mon) {
      const { size, position } = mon;
      const x = position.x + Math.floor((size.width - 480) / 2);
      const y = position.y + 8;
      await w.setPosition(new PhysicalPosition(x, y));
    }
  } catch {
    /* */
  }

  await w.show();
  return w;
}

export async function closeContextBarWindow(): Promise<void> {
  const w = await WebviewWindow.getByLabel(CONTEXT_BAR_LABEL);
  if (w) await w.close();
}
