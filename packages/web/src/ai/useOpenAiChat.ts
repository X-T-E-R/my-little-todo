import { useCallback } from 'react';
import { useModuleStore } from '../modules';
import { useAiChatStore } from './aiChatStore';
import type { AiPreset } from './types';

/** Opens the AI panel with optional preset without importing the full panel component. */
export function useOpenAiChat() {
  const enabled = useModuleStore((s) => s.isEnabled('ai-agent'));
  const openWithPreset = useAiChatStore((s) => s.openWithPreset);

  return useCallback(
    (preset: AiPreset, seed?: string) => {
      if (!enabled) return;
      openWithPreset(preset, seed);
    },
    [enabled, openWithPreset],
  );
}
