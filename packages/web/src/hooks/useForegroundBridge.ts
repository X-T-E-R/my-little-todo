import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn, listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { useModuleStore } from '../modules';
import { useWindowContextStore } from '../stores/windowContextStore';
import { isTauriEnv } from '../utils/platform';
import type { ForegroundPayload } from '../utils/windowContextMatch';

type FgPayload = {
  title: string;
  processName?: string | null;
  processId: number;
};

function toForegroundPayload(p: FgPayload): ForegroundPayload {
  return {
    title: p.title,
    processName: p.processName ?? null,
    processId: p.processId,
  };
}

/**
 * When desktop-widget or window-context modules are enabled, subscribe to Win32 foreground
 * changes (Windows) and keep `windowContextStore` in sync.
 */
export function useForegroundBridge(): void {
  const desktopWidget = useModuleStore((s) => s.isEnabled('desktop-widget'));
  const windowContext = useModuleStore((s) => s.isEnabled('window-context'));
  const setForeground = useWindowContextStore((s) => s.setForeground);
  const loadContexts = useWindowContextStore((s) => s.loadContexts);
  const isAnnotatorShell =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mlt') === 'annotator';
  const enabled = isTauriEnv() && (desktopWidget || windowContext || isAnnotatorShell);

  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (enabled) void loadContexts();
  }, [enabled, loadContexts]);

  useEffect(() => {
    if (!enabled) {
      setForeground(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await invoke('foreground_listen_start');
        const initial = await invoke<FgPayload | null>('get_foreground_window_info');
        if (!cancelled && initial) {
          setForeground(toForegroundPayload(initial));
        }
      } catch {
        /* non-Windows stub / permission */
      }

      try {
        unlistenRef.current = await listen<FgPayload>('foreground-changed', (ev) => {
          const p = toForegroundPayload(ev.payload);
          setForeground(p);
        });
      } catch {
        /* */
      }
    })();

    return () => {
      cancelled = true;
      void unlistenRef.current?.();
      unlistenRef.current = null;
      void invoke('foreground_listen_stop').catch(() => {});
      setForeground(null);
    };
  }, [enabled, setForeground]);
}
