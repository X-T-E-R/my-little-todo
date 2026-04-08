export interface AppModule {
  id: string;
  /** i18n key under `settings` namespace */
  nameKey: string;
  descriptionKey: string;
  defaultEnabled: boolean;
}

/** Built-in feature modules (toggleable in Settings → General). */
export const BUILT_IN_MODULES: AppModule[] = [
  {
    id: 'kanban',
    nameKey: 'module_kanban_name',
    descriptionKey: 'module_kanban_desc',
    defaultEnabled: true,
  },
  {
    id: 'time-capsule',
    nameKey: 'module_time_capsule_name',
    descriptionKey: 'module_time_capsule_desc',
    defaultEnabled: false,
  },
  {
    id: 'ai-coach',
    nameKey: 'module_ai_coach_name',
    descriptionKey: 'module_ai_coach_desc',
    defaultEnabled: true,
  },
  {
    id: 'energy-indicator',
    nameKey: 'module_energy_name',
    descriptionKey: 'module_energy_desc',
    defaultEnabled: true,
  },
  {
    id: 'brain-dump',
    nameKey: 'module_brain_dump_name',
    descriptionKey: 'module_brain_dump_desc',
    defaultEnabled: true,
  },
  {
    id: 'advanced-filter',
    nameKey: 'module_advanced_filter_name',
    descriptionKey: 'module_advanced_filter_desc',
    defaultEnabled: false,
  },
];
