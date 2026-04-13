import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getSetting } from '../storage/settingsApi';
import { getSettingsApiBase } from '../storage/settingsApi';
import { getAuthToken } from '../stores/authStore';
import { isNativeClient } from '../utils/platform';
import type { ResolvedAiConfig } from './types';

/**
 * Resolve OpenAI-compatible endpoint + credentials.
 * - Native (Tauri/Capacitor): always direct with local `ai-api-key`.
 * - Web: user key → direct; else shared server proxy when admin enabled.
 */
export async function resolveAiConfig(): Promise<ResolvedAiConfig | null> {
  const userKey = (await getSetting('ai-api-key'))?.trim();
  const endpointRaw = (await getSetting('ai-api-endpoint')) || 'https://api.openai.com/v1';
  const endpoint = endpointRaw.replace(/\/$/, '');
  const modelFallback = (await getSetting('ai-model')) || 'gpt-4o-mini';

  if (isNativeClient()) {
    if (!userKey) return null;
    return {
      mode: 'direct',
      baseURL: endpoint,
      apiKey: userKey,
      model: modelFallback,
    };
  }

  if (userKey) {
    return {
      mode: 'direct',
      baseURL: endpoint,
      apiKey: userKey,
      model: modelFallback,
    };
  }

  const base = getSettingsApiBase().replace(/\/$/, '');
  const token = getAuthToken();
  if (!base || !token) return null;

  try {
    const res = await fetch(`${base}/api/ai/shared-config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const shared = (await res.json()) as {
      available?: boolean;
      endpoint?: string;
      model?: string;
      allow_user_key?: boolean;
    };
    if (!shared.available || !shared.endpoint?.trim()) return null;

    const model = shared.model?.trim() || modelFallback;

    return {
      mode: 'proxy',
      baseURL: `${base}/api/ai`,
      apiKey: token,
      model,
    };
  } catch {
    return null;
  }
}

/** Chat Completions model (not Responses API). */
export function createChatModel(config: ResolvedAiConfig): LanguageModel {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return openai.chat(config.model);
}
