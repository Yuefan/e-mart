"use client";

import { useState, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

// Icons keyed by question id — locale-independent.
const icons: Record<string, ReactNode> = {
  what: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3.5" /><circle cx="12" cy="17" r="0.5" fill="currentColor" /></svg>,
  permissions: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4z" /></svg>,
  pricing: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1" fill="currentColor" /></svg>,
  multisite: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  freshness: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  install: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 5l-2 14" /></svg>,
  revoke: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" /></svg>,
};

export function MarketingFAQ({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const faq = t.marketing.faq;
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section id="faq" className="py-24" style={{ background: "#0b0d12" }}>
      <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2
            className="font-black text-white leading-[0.95]"
            style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)", letterSpacing: "-0.02em" }}
          >
            {faq.heading}
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {faq.items.map(({ id, q, a }) => {
            const isOpen = openSet.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                style={{
                  WebkitAppearance: "none",
                  appearance: "none",
                  outline: "none",
                  boxShadow: "none",
                  background: isOpen ? "rgba(255,255,255,0.04)" : "#12151c",
                }}
                className={`block w-full text-left p-9 flex flex-col cursor-pointer border transition-colors focus:outline-none ${isOpen ? "border-accent/40" : "border-white/10 hover:border-white/25"}`}
              >
                <span className="text-accent mb-6">
                  {icons[id]}
                </span>
                <h3 className="text-white font-bold leading-snug" style={{ ...CN, fontSize: "1.1rem" }}>
                  {q}
                </h3>
                <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-60 mt-4" : "max-h-0"}`}>
                  <p className="text-white/45 leading-relaxed" style={{ ...CN, fontSize: "0.95rem" }}>
                    {a}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
