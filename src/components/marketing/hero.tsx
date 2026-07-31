import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

// Chart geometry and demo figures are locale-independent; only labels translate.
const distribution = [
  { label: "roarland.net", value: 42 },
  { label: "shop.roarland.net", value: 28 },
  { label: "blog.roarland.net", value: 16 },
];

const donutGradient = `conic-gradient(var(--accent) 0% 48%, rgba(10,10,10,0.35) 48% 80%, rgba(10,10,10,0.12) 80% 100%)`;

const navIcons = [
  <svg key="overview" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  <svg key="keywords" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  <svg key="pages" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M2 9h20" /></svg>,
  <svg key="sites" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" /></svg>,
  <svg key="activity" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></svg>,
];

const aiProviders = [
  { name: "Anthropic", logo: "/logos/ai/anthropic.svg" },
  { name: "Google", logo: "/logos/ai/google.svg" },
  { name: "ByteDance", logo: "/logos/ai/bytedance.svg" },
  { name: "Qwen", logo: "/logos/ai/qwen.svg" },
  { name: "Kimi", logo: "/logos/ai/kimi.svg" },
  { name: "MiniMax", logo: "/logos/ai/minimax.svg" },
  { name: "DeepSeek", logo: "/logos/ai/deepseek.svg" },
];

export function MarketingHero({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const hero = t.marketing.hero;
  const d = hero.dash;

  return (
    <section
      id="top"
      className="relative overflow-hidden pt-[80px] min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            "radial-gradient(60% 85% at 88% 8%, var(--panel) 0%, transparent 60%)",
            "radial-gradient(55% 75% at 6% 96%, var(--accent-soft) 0%, transparent 55%)",
          ].join(", "),
        }}
      />

      <div className="absolute left-0 right-0 top-[80px] h-[3px] bg-accent z-10" />

      <div className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center gap-16 lg:gap-56 pt-16 pb-10 lg:pt-16 lg:pb-10">

          {/* Left — text */}
          <div className="max-w-[520px] shrink-0">
            <p
              className="text-[0.85rem] tracking-[0.22em] text-accent mb-9 uppercase"
              style={{ fontFamily: "var(--font-jetbrains), monospace" }}
            >
              {hero.eyebrow}
            </p>

            <h1
              className="font-black text-fg leading-[1.1] mb-10"
              style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.8rem, 5.6vw, 5.4rem)", letterSpacing: "-0.02em" }}
            >
              {hero.headline.line1}<br />
              {hero.headline.line2Before}<span className="text-accent">{hero.headline.line2Highlight}</span>
            </h1>

            <p className="text-muted leading-loose mb-14 max-w-[480px]" style={{ ...CN, fontSize: "1.02rem" }}>
              {hero.desc}
            </p>

            <div className="flex flex-wrap gap-5 mb-12">
              <Link
                href="/login"
                className="bg-accent text-white px-9 py-4 text-sm font-bold tracking-wider uppercase no-underline hover:opacity-90 transition-opacity"
              >
                {hero.ctaPrimary}
              </Link>
              <a
                href="#features"
                className="border border-line text-muted px-9 py-4 text-sm tracking-wider uppercase no-underline hover:text-fg transition-colors"
                style={CN}
              >
                {hero.ctaSecondary}
              </a>
            </div>

            <p
              className="text-[0.8rem] tracking-[0.15em] text-muted uppercase"
              style={{ fontFamily: "var(--font-jetbrains), monospace" }}
            >
              {hero.note}
            </p>
          </div>

          {/* Right — dashboard mockup */}
          <div className="relative w-full lg:flex-1 min-w-0">
            <div className="tools-dash-scroll-light overflow-x-auto">
              <div className="dash-mock bg-panel border border-line shadow-xl flex w-[1220px] max-w-none">

                {/* Sidebar */}
                <div className="w-[200px] shrink-0 border-r border-line flex flex-col">
                  <div className="px-6 py-5 border-b border-line flex items-center gap-2.5">
                    <span className="w-5 h-5 bg-accent shrink-0" />
                    <span className="font-black text-fg text-sm tracking-wide" style={{ fontFamily: "var(--font-barlow), sans-serif" }}>
                      ROARLAND
                    </span>
                  </div>
                  <div className="flex m-4 border border-line">
                    {d.tabs.map((tab, i) => (
                      <span
                        key={tab}
                        className={`flex-1 text-center py-2.5 text-[0.68rem] tracking-wider ${i === 0 ? "bg-fg text-bg" : "text-muted"}`}
                        style={{ fontFamily: "var(--font-jetbrains), monospace" }}
                      >
                        {tab}
                      </span>
                    ))}
                  </div>
                  <nav className="flex flex-col gap-1 px-4 mt-2">
                    {d.nav.map((label, i) => (
                      <div
                        key={label}
                        className={`flex items-center gap-3 px-3 py-2.5 text-[0.78rem] ${i === 0 ? "bg-accent/10 text-fg" : "text-muted"}`}
                        style={CN}
                      >
                        <span className={i === 0 ? "text-accent" : "text-muted"}>{navIcons[i]}</span>
                        {label}
                      </div>
                    ))}
                  </nav>
                  <div className="mt-auto m-4 border border-line p-4">
                    <p className="text-fg/70 text-[0.72rem]" style={CN}>{d.demoLabel}</p>
                    <p className="text-accent text-[0.68rem] mt-1.5" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>roarland.net</p>
                  </div>
                </div>

                {/* Main panel */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center justify-between px-7 py-5 border-b border-line">
                    <div>
                      <p className="text-fg font-bold" style={{ ...CN, fontSize: "0.98rem" }}>{d.title}</p>
                      <p className="text-muted text-[0.78rem] mt-1" style={CN}>{d.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {d.ranges.map((label, i) => (
                        <span
                          key={label}
                          className={`text-[0.62rem] tracking-wider px-3 py-2 border border-line ${i === 1 ? "bg-fg text-bg" : "text-muted"}`}
                          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 border-b border-line">
                    {d.metrics.map(({ id, label, value, delta }, i) => (
                      <div key={id} className={`p-7 ${i % 3 !== 2 ? "border-r" : ""} ${i < 3 ? "border-b" : ""} border-line`}>
                        <p
                          className="text-[0.6rem] tracking-[0.13em] text-muted uppercase mb-3"
                          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
                        >
                          {label}
                        </p>
                        <p className="font-black text-fg leading-none" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.75rem" }}>
                          {value}
                        </p>
                        <p className="text-[0.68rem] text-pos mt-2" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{delta}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1.4fr_1fr] border-b border-line">
                    <div className="p-7 border-r border-line">
                      <p className="text-[0.6rem] tracking-[0.13em] text-muted uppercase mb-5" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                        {d.trendTitle}
                      </p>
                      <div className="flex items-end gap-2 h-24">
                        {[38, 52, 44, 60, 55, 70, 66, 82, 74, 90, 84, 96].map((h, i) => (
                          <div key={i} className="flex-1 bg-accent/75" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>

                    <div className="p-7">
                      <p className="text-[0.6rem] tracking-[0.13em] text-muted uppercase mb-5" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                        {d.distributionTitle}
                      </p>
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-full shrink-0 relative" style={{ background: donutGradient }}>
                          <div className="absolute inset-[4px] rounded-full bg-panel flex items-center justify-center">
                            <span className="text-fg text-[0.7rem]" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>3</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 min-w-0">
                          {distribution.map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                              <span className="text-muted text-[0.7rem] truncate">{label}</span>
                              <span className="text-[0.68rem] text-fg/70 shrink-0" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{value}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-7">
                    <p className="text-[0.6rem] tracking-[0.13em] text-muted uppercase mb-5" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                      {d.rankingTitle}
                    </p>
                    <div className="flex flex-col gap-4">
                      {d.ranking.map(({ id, q, clicks, pct }) => (
                        <div key={id} className="flex items-center gap-4">
                          <span className="text-muted text-[0.78rem] w-40 shrink-0 truncate" style={CN}>{q}</span>
                          <div className="flex-1 h-2 bg-line relative">
                            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[0.7rem] text-muted w-10 text-right shrink-0" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{clicks}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrolling AI-provider logo strip */}
      <div className="relative z-10 border-t border-line py-6 overflow-hidden">
        <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-8 flex items-center">
          <div className="overflow-hidden flex-1" style={{ maskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)" }}>
            <div className="marquee-track flex items-center gap-28 whitespace-nowrap w-max">
              {[...Array(4)].map((_, rep) => (
                <span key={rep} className="flex items-center gap-28 shrink-0">
                  {aiProviders.map(({ name, logo }) => (
                    <span key={name} className="flex items-center gap-3.5 shrink-0 text-muted hover:text-fg transition-colors">
                      <img src={logo} alt={name} className="w-9 h-9 shrink-0" style={{ filter: "grayscale(1)", opacity: 0.75 }} />
                      <span className="font-bold uppercase tracking-wide" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.3rem" }}>
                        {name}
                      </span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
