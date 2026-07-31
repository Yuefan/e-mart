import type { CSSProperties } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

// ── Radar chart geometry (6 axes) ──
const RADAR_SIZE = 280;
const RADAR_C = RADAR_SIZE / 2;
const RADAR_R = 108;

const radarStyle: Record<string, { color: string; fill: string; values: number[] }> = {
  manual: { color: "var(--muted)", fill: "none", values: [0.3, 0.2, 0.25, 0.4, 0.3, 0.5] },
  excel: { color: "var(--fg)", fill: "none", values: [0.45, 0.35, 0.5, 0.55, 0.45, 0.6] },
  roarland: { color: "var(--accent)", fill: "var(--accent-soft)", values: [0.9, 0.85, 0.95, 0.9, 0.88, 0.82] },
};

const radarPoint = (i: number, value: number) => {
  const angle = (Math.PI / 180) * (i * 60 - 90);
  const x = RADAR_C + RADAR_R * value * Math.cos(angle);
  const y = RADAR_C + RADAR_R * value * Math.sin(angle);
  return `${x},${y}`;
};
const radarPolygon = (values: number[]) => values.map((v, i) => radarPoint(i, v)).join(" ");
const radarLabelStyle: CSSProperties[] = [
  { top: "-1.6em", left: "50%", transform: "translateX(-50%)" },
  { top: "20%", right: "-2.2em" },
  { bottom: "20%", right: "-1.6em" },
  { bottom: "-1.6em", left: "50%", transform: "translateX(-50%)" },
  { bottom: "20%", left: "-2.4em" },
  { top: "20%", left: "-2.2em" },
];

// ── Orbital diagram geometry (8 satellites) ──
const ORBIT_SIZE = 300;
const ORBIT_C = ORBIT_SIZE / 2;
const ORBIT_R = 118;
const orbitPos = (i: number) => {
  const angle = (Math.PI / 180) * (i * 45 - 90);
  return {
    x: ORBIT_C + ORBIT_R * Math.cos(angle),
    y: ORBIT_C + ORBIT_R * Math.sin(angle),
  };
};

export function MarketingFeatures({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const features = t.marketing.features;
  const [sovereignty, unified, insights] = features.cards;
  const series = features.radarSeries.map((s) => ({ ...s, ...radarStyle[s.id] }));

  return (
    <section id="features" className="bg-panel py-24">
      <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2
            className="font-black text-fg leading-[0.95] mb-5"
            style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)", letterSpacing: "-0.02em" }}
          >
            {features.heading}
          </h2>
          <p className="text-muted leading-relaxed" style={{ ...CN, fontSize: "1.1rem" }}>
            {features.desc}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* 01 — Data Sovereignty · radar chart */}
          <div className="border border-line p-10 flex flex-col">
            <p className="text-[0.85rem] text-accent mb-4" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{sovereignty.num}</p>
            <h3 className="font-black text-fg mb-8" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.9rem" }}>
              {sovereignty.title}
            </h3>

            <div className="relative mx-auto" style={{ width: RADAR_SIZE, height: RADAR_SIZE }}>
              <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
                {[0.33, 0.66, 1].map((ring) => (
                  <polygon key={ring} points={radarPolygon(features.radarAxes.map(() => ring))} fill="none" stroke="var(--line)" />
                ))}
                {features.radarAxes.map((_, i) => (
                  <line
                    key={i}
                    x1={RADAR_C} y1={RADAR_C}
                    x2={radarPoint(i, 1).split(",")[0]} y2={radarPoint(i, 1).split(",")[1]}
                    stroke="var(--line)"
                  />
                ))}
                {series.map(({ id, color, fill, values }) => (
                  <polygon key={id} points={radarPolygon(values)} fill={fill} stroke={color} strokeWidth={id === "roarland" ? 2 : 1.5} />
                ))}
              </svg>
              {features.radarAxes.map((label, i) => (
                <span
                  key={label}
                  className="absolute text-[0.72rem] tracking-wider text-muted uppercase whitespace-nowrap"
                  style={{ ...radarLabelStyle[i], fontFamily: "var(--font-jetbrains), monospace" }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-8 pt-6 border-t border-line">
              {series.map(({ id, name, color }) => (
                <span key={id} className="flex items-center gap-1.5 text-[0.82rem] text-muted" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                  <span className="w-2.5 h-[2px]" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* 02 — Unified View · checklist */}
          <div className="border border-line p-10 flex flex-col">
            <p className="text-[0.85rem] text-accent mb-4" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{unified.num}</p>
            <h3 className="font-black text-fg mb-8" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.9rem" }}>
              {unified.title}
            </h3>

            <div className="flex flex-col">
              {features.checklist.map(({ id, title, desc }, i) => (
                <div key={id} className={`flex items-center justify-between gap-4 py-4 ${i > 0 ? "border-t border-line" : ""}`}>
                  <div>
                    <p className="text-fg font-bold" style={{ ...CN, fontSize: "1.08rem" }}>{title}</p>
                    <p className="text-muted mt-1" style={{ ...CN, fontSize: "0.94rem" }}>{desc}</p>
                  </div>
                  <span className="text-accent shrink-0 text-lg">✓</span>
                </div>
              ))}
            </div>

            <p className="mt-auto pt-8 text-muted text-[0.85rem]" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
              {features.unifiedNote}
            </p>
          </div>

          {/* 03 — AI Insights · orbital diagram */}
          <div className="border border-line p-10 flex flex-col">
            <p className="text-[0.85rem] text-accent mb-4" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{insights.num}</p>
            <h3 className="font-black text-fg mb-8" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.9rem" }}>
              {insights.title}
            </h3>

            <div className="relative mx-auto" style={{ width: ORBIT_SIZE, height: ORBIT_SIZE }}>
              <svg width={ORBIT_SIZE} height={ORBIT_SIZE} className="absolute inset-0">
                {features.orbitNodes.map((_, i) => {
                  const { x, y } = orbitPos(i);
                  return <line key={i} x1={ORBIT_C} y1={ORBIT_C} x2={x} y2={y} stroke="color-mix(in srgb, var(--accent) 35%, transparent)" strokeDasharray="3 4" />;
                })}
              </svg>

              <div
                className="absolute rounded-full bg-panel-alt border border-line flex items-center justify-center text-center"
                style={{ width: 104, height: 104, left: ORBIT_C - 52, top: ORBIT_C - 52 }}
              >
                <span
                  className="text-[0.74rem] tracking-wider text-muted uppercase leading-tight"
                  style={{ whiteSpace: "pre-line", fontFamily: "var(--font-jetbrains), monospace" }}
                >
                  {features.orbitCenter}
                </span>
              </div>

              {features.orbitNodes.map((label, i) => {
                const { x, y } = orbitPos(i);
                return (
                  <div
                    key={label}
                    className="absolute rounded-full bg-panel border border-accent/50 flex items-center justify-center"
                    style={{ width: 64, height: 64, left: x - 32, top: y - 32 }}
                  >
                    <span className="text-[0.72rem] text-fg text-center leading-tight px-1" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{label}</span>
                  </div>
                );
              })}
            </div>

            <p className="mt-auto pt-8 text-muted leading-relaxed" style={{ ...CN, fontSize: "0.96rem" }}>
              {features.insightsNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
