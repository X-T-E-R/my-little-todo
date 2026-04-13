import type { RecommendationEvent } from '../stores/behaviorStore';

export interface HourlyAcceptance {
  hour: number;
  accepted: number;
  rejected: number;
  swapped: number;
}

const DEFAULT_DAYS_BACK = 30;

/** Aggregate recommendation actions by local hour for the last N days. */
export function computeHourlyAcceptancePatterns(
  events: RecommendationEvent[],
  daysBack = DEFAULT_DAYS_BACK,
): HourlyAcceptance[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  const byHour = new Map<number, { accepted: number; rejected: number; swapped: number }>();
  for (let h = 0; h < 24; h++) {
    byHour.set(h, { accepted: 0, rejected: 0, swapped: 0 });
  }

  for (const e of events) {
    if (e.timestamp < cutoff) continue;
    const h = e.timestamp.getHours();
    const row = byHour.get(h);
    if (!row) continue;
    if (e.action === 'accepted') row.accepted += 1;
    else if (e.action === 'rejected') row.rejected += 1;
    else row.swapped += 1;
  }

  return Array.from(byHour.entries())
    .map(([hour, v]) => ({
      hour,
      accepted: v.accepted,
      rejected: v.rejected,
      swapped: v.swapped,
    }))
    .sort((a, b) => a.hour - b.hour);
}

/** Total interactions in an hour (for confidence). */
function totalInteractions(h: HourlyAcceptance): number {
  return h.accepted + h.rejected + h.swapped;
}

/** Acceptance ratio; ignores swaps for ratio, treats low data as neutral. */
function acceptanceRatio(h: HourlyAcceptance): number | null {
  const t = h.accepted + h.rejected;
  if (t < 3) return null;
  return h.accepted / t;
}

/**
 * Score bump for recommendation (-18 … +18) from learned hourly acceptance vs current hour.
 */
export function getHourPreferenceBoost(hour: number, patterns: HourlyAcceptance[]): number {
  if (patterns.length === 0) return 0;
  const current = patterns.find((p) => p.hour === hour);
  if (!current || totalInteractions(current) < 3) return 0;

  let best: HourlyAcceptance | null = null;
  let bestRatio = -1;
  for (const p of patterns) {
    const r = acceptanceRatio(p);
    if (r === null) continue;
    if (r > bestRatio) {
      bestRatio = r;
      best = p;
    }
  }
  let worst: HourlyAcceptance | null = null;
  let worstRatio = 2;
  for (const p of patterns) {
    const r = acceptanceRatio(p);
    if (r === null) continue;
    if (r < worstRatio) {
      worstRatio = r;
      worst = p;
    }
  }

  const curR = acceptanceRatio(current);
  if (curR === null) return 0;

  if (best && current.hour === best.hour && bestRatio - worstRatio > 0.15) return 18;
  if (worst && current.hour === worst.hour && bestRatio - worstRatio > 0.15) return -18;

  if (curR >= 0.55) return 10;
  if (curR <= 0.35) return -10;
  return 0;
}

/** Best hour by acceptance ratio (min 4 interactions). */
export function findPeakProductivityHour(patterns: HourlyAcceptance[]): number | null {
  let best: { hour: number; ratio: number } | null = null;
  for (const p of patterns) {
    const r = acceptanceRatio(p);
    if (r === null || totalInteractions(p) < 4) continue;
    if (!best || r > best.ratio) best = { hour: p.hour, ratio: r };
  }
  return best?.hour ?? null;
}

/** Worst hour by acceptance ratio (min 4 interactions). */
export function findLowEnergyHour(patterns: HourlyAcceptance[]): number | null {
  let worst: { hour: number; ratio: number } | null = null;
  for (const p of patterns) {
    const r = acceptanceRatio(p);
    if (r === null || totalInteractions(p) < 4) continue;
    if (!worst || r < worst.ratio) worst = { hour: p.hour, ratio: r };
  }
  return worst?.hour ?? null;
}
