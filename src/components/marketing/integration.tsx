import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

export function MarketingIntegration({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const integration = t.marketing.integration;

  return (
    <section id="integration" className="py-24" style={{ background: "#0b0d12" }}>
      <div className="max-w-[1920px] mx-auto px-6 lg:px-8">
        <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
          <div>
            <h2
              className="font-black text-white leading-[1.25]"
              style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)", letterSpacing: "0.1em" }}
            >
              {integration.heading.line1}<br />{integration.heading.line2}
            </h2>
          </div>
          <p className="text-white/30 max-w-xs" style={CN}>
            {integration.aside}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-14">
          {integration.steps.map(({ num, title, desc }) => (
            <div key={num} className="border border-white/10 p-8 hover:border-accent/50 transition-colors">
              <p className="font-black text-accent/60 leading-none mb-6" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "2.6rem" }}>
                {num}
              </p>
              <h3 className="text-white font-bold mb-3" style={{ ...CN, fontSize: "1.25rem" }}>
                {title}
              </h3>
              <p className="text-white/45 leading-relaxed" style={{ ...CN, fontSize: "0.98rem" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* OAuth scope terminal card */}
        <div className="border border-white/10 max-w-2xl" style={{ background: "#12151c" }}>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/8">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="ml-4 text-[0.78rem] tracking-wider text-white/30" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
              {integration.terminal.label}
            </span>
          </div>
          <div className="p-7 text-[0.92rem] leading-loose" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
            <p className="text-white/40">{integration.terminal.comment}</p>
            {integration.terminal.scopes.map(({ id, name, note }) => (
              <p key={id} className="text-white/70">
                ✓ <span className="text-white">{name}</span> <span className="text-white/30">{note}</span>
              </p>
            ))}
            <p className="text-accent/80">{integration.terminal.denied}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
