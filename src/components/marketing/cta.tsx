import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

export function MarketingCTA({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const cta = t.marketing.cta;

  return (
    <section className="bg-panel py-24 border-t border-line">
      <div className="max-w-4xl mx-auto px-8 text-center">
        <h2
          className="font-black text-fg leading-[1.05] mb-6"
          style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.2rem, 5vw, 4rem)", letterSpacing: "-0.02em" }}
        >
          {cta.heading.line1}<br />{cta.heading.line2}
        </h2>
        <p className="text-muted max-w-lg mx-auto mb-10 leading-relaxed" style={{ ...CN, fontSize: "1.1rem" }}>
          {cta.desc}
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/login"
            className="bg-accent text-white px-9 py-4 text-sm font-bold tracking-wider uppercase no-underline hover:opacity-90 transition-opacity"
          >
            {cta.ctaPrimary}
          </Link>
          <a
            href="#faq"
            className="border border-line text-muted px-9 py-4 text-sm tracking-wider uppercase no-underline hover:text-fg transition-colors"
            style={CN}
          >
            {cta.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}
