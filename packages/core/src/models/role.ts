export interface Role {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  order: number;
  createdAt: Date;
  lastActiveAt?: Date;
  lastActivitySummary?: string;
}
