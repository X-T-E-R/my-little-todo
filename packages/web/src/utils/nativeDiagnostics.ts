import { invoke } from '@tauri-apps/api/core';

type NativeDiagnosticLevel = 'info' | 'warn' | 'error';

function isTauriWindow(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function formatDiagnosticDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack?.trim() || detail.message || String(detail);
  }

  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export async function reportNativeDiagnostic(
  level: NativeDiagnosticLevel,
  message: string,
  detail?: unknown,
): Promise<void> {
  if (!isTauriWindow()) {
    return;
  }

  const payload = detail == null ? message : `${message}\n${formatDiagnosticDetail(detail)}`;

  try {
    await invoke('native_diagnostic_log', {
      level,
      message: payload,
    });
  } catch {
    /* diagnostics should never block app startup */
  }
}
