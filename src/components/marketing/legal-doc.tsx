import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

type LegalDoc = Dictionary["legal"]["privacy"] | Dictionary["legal"]["terms"];

export function MarketingLegalDoc({ t, locale, doc }: { t: Dictionary; locale: Locale; doc: LegalDoc }) {
  const CN = bodyFont[locale];
  const legal = t.legal;

  return (
    <main style={{ background: "var(--bg)" }} className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-accent hover:underline"
          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
        >
          ← {legal.backLink}
        </Link>

        <h1
          className="mt-8 mb-2 font-black text-fg"
          style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em" }}
        >
          {doc.title}
        </h1>
        <p className="mb-10 text-muted text-sm" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
          {legal.updatedLabel}: {doc.updated}
        </p>

        <p className="mb-12 text-fg/80 leading-relaxed" style={{ ...CN, fontSize: "1.02rem" }}>
          {doc.intro}
        </p>

        <div className="flex flex-col gap-10">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="border-t border-line pt-8">
              <h2 className="mb-4 font-bold text-fg" style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: "1.4rem" }}>
                {section.heading}
              </h2>
              {section.paragraphs?.map((p, i) => (
                <p key={i} className="mb-3 text-fg/80 leading-relaxed" style={{ ...CN, fontSize: "0.98rem" }}>
                  {p}
                </p>
              ))}
              {section.bullets ? (
                <ul className="flex flex-col gap-2 pl-5 list-disc">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="text-fg/80 leading-relaxed" style={{ ...CN, fontSize: "0.98rem" }}>
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
