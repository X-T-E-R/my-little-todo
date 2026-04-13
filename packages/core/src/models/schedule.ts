export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface ScheduleBlock {
  id: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  recurrence: RecurrenceType;
  daysOfWeek: number[];
  validFrom?: Date;
  validUntil?: Date;
  exceptions: string[];
  location?: string;
  roleId?: string;
}

/** Rough time-of-day slice for UI and heuristics (local clock). */
export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/** Snapshot of “where we are in time” for Now view and recommendations. */
export interface TimeContext {
  period: TimeOfDayPeriod;
  /** Local hour 0–23 */
  hour: number;
  inFixedBlock: boolean;
  fixedBlockName?: string;
  fixedBlockId?: string;
  /** Minutes until the next fixed block starts, if within the lookahead window. */
  approachingBlockMinutes: number | null;
}

export type TimeSlotSuggestionKind =
  | 'neutral'
  | 'prefer_short'
  | 'prefer_light'
  | 'prefer_heavy'
  | 'in_fixed_block';

/** Lightweight hint for copy / scoring (host maps to i18n). */
export interface TimeSlotSuggestion {
  kind: TimeSlotSuggestionKind;
  /** i18n key (e.g. under `now` namespace). */
  messageKey: string;
}
