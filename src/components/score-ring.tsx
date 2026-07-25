import { cn } from "@/lib/utils";

/**
 * Single-value gauge rather than a chart: one number, no comparison, no time
 * axis. Colour follows the status palette and never carries the meaning alone —
 * the number and the band label are both present.
 */
export function ScoreRing({ score, size = 104 }: { score: number; size?: number }) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  const band =
    score >= 80
      ? { label: "Good", color: "var(--pos)" }
      : score >= 55
        ? { label: "Needs work", color: "var(--accent)" }
        : { label: "Poor", color: "var(--neg)" };

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} role="img" aria-label={`SEO score ${score} of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={band.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-fg text-2xl font-semibold"
          style={{ fontSize: size * 0.28 }}
        >
          {score}
        </text>
      </svg>

      <div>
        <p className={cn("text-sm font-semibold")} style={{ color: band.color }}>
          {band.label}
        </p>
        <p className="text-xs text-muted">out of 100</p>
      </div>
    </div>
  );
}
