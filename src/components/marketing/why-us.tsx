import type { ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

// Icons keyed by reason id — locale-independent.
const icons: Record<string, ReactNode> = {
  readonly: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="10" rx="1" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  encryption: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  official: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" />
    </svg>
  ),
  multisite: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  nodev: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  support: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

export function MarketingWhyUs({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const whyUs = t.marketing.whyUs;

  return (
    <section id="why" className="bg-panel py-24">
      <div className="max-w-[1920px] mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2
            className="font-black text-fg leading-[0.95]"
            style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)", letterSpacing: "-0.02em" }}
          >
            {whyUs.heading}
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {whyUs.reasons.map(({ id, title, desc }) => (
            <div key={id} className="flex gap-5">
              <span className="w-11 h-11 shrink-0 border border-accent/30 text-accent flex items-center justify-center">
                {icons[id]}
              </span>
              <div>
                <h3 className="text-fg font-bold mb-2" style={{ ...CN, fontSize: "1.18rem" }}>
                  {title}
                </h3>
                <p className="text-muted leading-relaxed" style={{ ...CN, fontSize: "0.98rem" }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
