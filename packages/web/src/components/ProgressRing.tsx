/** Small SVG ring 0–1 progress (ADHD-friendly visual, no harsh numbers). */

export function ProgressRing({
  progress,
  size = 36,
  stroke = 3,
}: {
  progress: number;
  size?: number;
  stroke?: number;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p);
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden="true" focusable="false">
      <title>Progress</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-success)"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
      />
    </svg>
  );
}
