export { useBehaviorStore, getTodayStats, getWeekStats } from './behaviorStore';
export {
  useCoachActivityStore,
  countTaskSwitchesInWindow,
  countViewSwitchesInWindow,
} from './coachActivityStore';
export { useExecCoachStore } from './execCoachStore';
export type { EnergyLevel, WorkMode, WorkStateHistoryEntry } from './execCoachStore';
export {
  ensureFocusSessionHydrated,
  useFocusSessionStore,
  type FocusSessionState,
} from './focusSessionStore';
export { useNowOverrideStore } from './nowOverrideStore';
export { useKanbanUiStore } from './kanbanUiStore';
export { useStreamStore, groupEntriesByDate } from './streamStore';
export {
  useStreamFilterStore,
  applyAdvancedFilter,
  countConditions,
  createEmptyRoot,
} from './streamFilterStore';
export type {
  FilterCondition,
  FilterGroupNode,
  FilterNode,
  FilterField,
  FilterOp,
} from './streamFilterStore';
export {
  useTaskStore,
  getActiveTasks,
  getTasksWithDdl,
  getTasksWithoutDdl,
  getCompletedTasks,
  pickRecommendation,
  pickRandom,
  formatDdlLabel,
  countWipTasks,
} from './taskStore';
export type { PickRecommendationOptions } from './taskStore';
export { useRoleStore, filterByRole, NO_ROLE_FILTER } from './roleStore';
export {
  useTimeAwarenessStore,
  useTimeAwarenessStore as useScheduleStore,
  isInScheduleBlock,
  isApproachingBlock,
  minutesUntilNextBlockStart,
  getCurrentTimeContext,
  getTimeSlotSuggestion,
  computeHourlyAcceptancePatterns,
  getHourPreferenceBoost,
  getLearnedTimeSummary,
} from './timeAwarenessStore';
export type { ScheduleBlock } from './timeAwarenessStore';
export { useShortcutStore } from './shortcutStore';
export { useAuthStore, getAuthToken } from './authStore';
export { useModuleStore } from '../modules/moduleStore';
export { useWindowContextStore } from './windowContextStore';
export { useThinkSessionStore } from './thinkSessionStore';
export {
  getRecentStreamCandidates,
  getRecommendedThread,
  useWorkThreadStore,
} from './workThreadStore';
