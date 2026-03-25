export type Platform = 'tauri' | 'capacitor' | 'web-hosted' | 'web-standalone';

let _platform: Platform | null = null;
let _detectPromise: Promise<Platform> | null = null;

function detectSync(): Platform | null {
  if (typeof window === 'undefined') return null;
  if ('__TAURI_INTERNALS__' in window) return 'tauri';
  if ('Capacitor' in window && (window as Record<string, unknown>).Capacitor) return 'capacitor';
  return null;
}

async function detectAsync(): Promise<Platform> {
  const sync = detectSync();
  if (sync) return sync;

  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) return 'web-hosted';
  } catch {
    /* not reachable */
  }

  return 'web-standalone';
}

export async function initPlatform(): Promise<Platform> {
  if (_platform) return _platform;
  if (!_detectPromise) _detectPromise = detectAsync();
  _platform = await _detectPromise;
  return _platform;
}

export function getPlatform(): Platform {
  if (_platform) return _platform;
  const sync = detectSync();
  if (sync) {
    _platform = sync;
    return sync;
  }
  return 'web-hosted';
}

export function isTauriEnv(): boolean {
  return getPlatform() === 'tauri';
}
export function isCapacitorEnv(): boolean {
  return getPlatform() === 'capacitor';
}
export function isWebHosted(): boolean {
  return getPlatform() === 'web-hosted';
}
export function isWebStandalone(): boolean {
  return getPlatform() === 'web-standalone';
}

export function canEditBackendUrl(): boolean {
  return getPlatform() !== 'web-hosted';
}
export function isNativeClient(): boolean {
  const p = getPlatform();
  return p === 'tauri' || p === 'capacitor';
}
export function canExportToFolder(): boolean {
  return getPlatform() === 'tauri';
}
export function hasKeyboardShortcuts(): boolean {
  return getPlatform() !== 'capacitor';
}
