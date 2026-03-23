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
