export type StabilityLevel = 'stable' | 'beta' | 'experimental';
export type BuiltinModuleCategory =
  | 'views-and-organization'
  | 'thinking-and-ai'
  | 'capture-and-context'
  | 'rhythm-and-feedback'
  | 'integrations';

export interface AppModule {
  id: string;
  /** i18n key under `settings` namespace */
  nameKey: string;
  descriptionKey: string;
  defaultEnabled: boolean;
  stability: StabilityLevel;
  /** If true, show a sidebar entry below About when the module is enabled */
  hasSettingsPage?: boolean;
  source?: 'builtin' | 'plugin';
  /** When source is plugin, show this name instead of translating nameKey */
  pluginDisplayName?: string;
  pluginDescription?: string;
  category?: BuiltinModuleCategory;
  categoryOrder?: number;
}

/** Built-in feature modules (toggleable in Settings → General). */
export const BUILT_IN_MODULES: AppModule[] = [
  {
    id: 'kanban',
    nameKey: 'module_kanban_name',
    descriptionKey: 'module_kanban_desc',
    defaultEnabled: true,
    stability: 'stable',
    hasSettingsPage: true,
    category: 'views-and-organization',
    categoryOrder: 0,
  },
  {
    id: 'time-capsule',
    nameKey: 'module_time_capsule_name',
    descriptionKey: 'module_time_capsule_desc',
    defaultEnabled: false,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'rhythm-and-feedback',
    categoryOrder: 1,
  },
  {
    id: 'ai-coach',
    nameKey: 'module_ai_coach_name',
    descriptionKey: 'module_ai_coach_desc',
    defaultEnabled: true,
    stability: 'beta',
    category: 'thinking-and-ai',
    categoryOrder: 2,
  },
  {
    id: 'energy-indicator',
    nameKey: 'module_energy_name',
    descriptionKey: 'module_energy_desc',
    defaultEnabled: true,
    stability: 'stable',
    category: 'rhythm-and-feedback',
    categoryOrder: 0,
  },
  {
    id: 'brain-dump',
    nameKey: 'module_brain_dump_name',
    descriptionKey: 'module_brain_dump_desc',
    defaultEnabled: true,
    stability: 'stable',
    category: 'capture-and-context',
    categoryOrder: 0,
  },
  {
    id: 'think-session',
    nameKey: 'module_think_session_name',
    descriptionKey: 'module_think_session_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'thinking-and-ai',
    categoryOrder: 0,
  },
  {
    id: 'ai-agent',
    nameKey: 'module_ai_agent_name',
    descriptionKey: 'module_ai_agent_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'thinking-and-ai',
    categoryOrder: 1,
  },
  {
    id: 'advanced-filter',
    nameKey: 'module_advanced_filter_name',
    descriptionKey: 'module_advanced_filter_desc',
    defaultEnabled: false,
    stability: 'stable',
    category: 'views-and-organization',
    categoryOrder: 1,
  },
  {
    id: 'mcp-integration',
    nameKey: 'module_mcp_name',
    descriptionKey: 'module_mcp_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'integrations',
    categoryOrder: 0,
  },
  {
    id: 'file-host',
    nameKey: 'module_file_host_name',
    descriptionKey: 'module_file_host_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'integrations',
    categoryOrder: 1,
  },
  {
    id: 'desktop-widget',
    nameKey: 'module_desktop_widget_name',
    descriptionKey: 'module_desktop_widget_desc',
    defaultEnabled: false,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'capture-and-context',
    categoryOrder: 1,
  },
  {
    id: 'window-context',
    nameKey: 'module_window_context_name',
    descriptionKey: 'module_window_context_desc',
    defaultEnabled: false,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'capture-and-context',
    categoryOrder: 2,
  },
  {
    id: 'time-awareness',
    nameKey: 'module_time_awareness_name',
    descriptionKey: 'module_time_awareness_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'rhythm-and-feedback',
    categoryOrder: 2,
  },
  {
    id: 'stream-context-panel',
    nameKey: 'module_stream_context_panel_name',
    descriptionKey: 'module_stream_context_panel_desc',
    defaultEnabled: true,
    stability: 'beta',
    hasSettingsPage: true,
    category: 'views-and-organization',
    categoryOrder: 2,
  },
];
