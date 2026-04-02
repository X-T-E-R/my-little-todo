export { useBehaviorStore, getTodayStats, getWeekStats } from './behaviorStore';
export {
  useCoachActivityStore,
  countTaskSwitchesInWindow,
  countViewSwitchesInWindow,
} from './coachActivityStore';
export { useExecCoachStore } from './execCoachStore';
export type { EnergyLevel } from './execCoachStore';
export { useFocusSessionStore } from './focusSessionStore';
export { useStreamStore, groupEntriesByDate } from './streamStore';
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
export { useScheduleStore, isInScheduleBlock } from './scheduleStore';
export { useShortcutStore } from './shortcutStore';
export { useAuthStore, getAuthToken } from './authStore';
