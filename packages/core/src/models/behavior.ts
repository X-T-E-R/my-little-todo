export type BehaviorEventType =
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'focus_started'
  | 'focus_completed'
  | 'focus_abandoned'
  | 'task_completed'
  | 'task_postponed'
  | 'task_archived'
  | 'ddl_met'
  | 'ddl_missed'
  | 'app_opened'
  | 'view_switched'
  | 'now_view_dismissed'
  | 'role_switched'
  | 'ai_operation_confirmed'
  | 'ai_operation_rejected'
  | 'ai_operation_reverted';

export interface BehaviorEvent {
  id: string;
  timestamp: Date;
  type: BehaviorEventType;
  payload: Record<string, unknown>;
}

export type RejectionReason = 'no_conditions' | 'too_big' | 'dont_want' | 'something_urgent';

export interface AvoidancePattern {
  taskType: string;
  rejectionCount: number;
  lastSuggested: Date;
  notes?: string;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface UserProfile {
  updatedAt: Date;
  activeHours: TimeRange[];
  preferredTaskTypes: string[];
  avgStartupDelayMinutes: number;
  avgFocusDurationMinutes: number;
  ddlSlipRate: number;
  avgDdlSlipDays: number;
  avoidancePatterns: AvoidancePattern[];
  totalCompleted: number;
  totalPostponed: number;
  onTimeRate: number;
}
