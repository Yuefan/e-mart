import Image from "next/image";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bodyFont } from "./fonts";

const mailIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const phoneIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l1.06-.97a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export function MarketingFooter({ t, locale }: { t: Dictionary; locale: Locale }) {
  const CN = bodyFont[locale];
  const nav = t.marketing.nav;
  const footer = t.marketing.footer;

  const contactItems = [
    { id: "email", icon: mailIcon, text: footer.email, href: `mailto:${footer.email}` },
    { id: "phone", icon: phoneIcon, text: footer.phone, href: `tel:${footer.phone.replace(/\s+/g, "")}` },
  ];

  return (
    <footer id="contact" style={{ background: "#0b0d12" }} className="border-t-[3px] border-accent">
      <div className="max-w-[1920px] mx-auto px-6 lg:px-8 pt-16 pb-10">
        <div className="grid md:grid-cols-5 gap-10 pb-12 border-b border-white/10 mb-8">

          <div className="md:col-span-2">
            <a href="https://roarland.ai" className="inline-block">
              <Image
                src="/logos/ROARLAND-Logo5-transparent.png"
                alt="ROARLAND"
                width={240}
                height={56}
                className="h-10 w-auto mb-5"
                unoptimized
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </a>
            <p className="text-white/60 leading-relaxed" style={{ ...CN, fontSize: "0.9rem", whiteSpace: "pre-line" }}>
              {footer.tagline}
            </p>
          </div>

          <div>
            <h4
              className="text-[0.7rem] tracking-[0.15em] uppercase text-white/40 mb-5"
              style={{ ...CN, fontFamily: "var(--font-jetbrains), monospace" }}
            >
              {footer.linksHeading}
            </h4>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {nav.links.map((link) => (
                <li key={link.hash}>
                  <a
                    href={`#${link.hash}`}
                    className="text-white/65 no-underline hover:text-white transition-colors"
                    style={{ ...CN, fontSize: "0.92rem" }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4
              className="text-[0.7rem] tracking-[0.15em] uppercase text-white/40 mb-5"
              style={{ ...CN, fontFamily: "var(--font-jetbrains), monospace" }}
            >
              {footer.contactHeading}
            </h4>
            <div className="flex flex-col gap-4">
              {contactItems.map(({ id, icon, text, href }) => (
                <div key={id} className="flex items-start gap-3">
                  <span className="text-accent shrink-0 mt-0.5">{icon}</span>
                  <a href={href} className="text-white/65 no-underline hover:text-white transition-colors" style={{ ...CN, fontSize: "0.92rem" }}>
                    {text}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-white/30" style={{ ...CN, fontSize: "0.8rem" }}>
            {footer.copyright}
          </span>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-white/30 no-underline hover:text-white/60 transition-colors"
              style={{ ...CN, fontSize: "0.8rem" }}
            >
              {footer.privacyLink}
            </Link>
            <Link
              href="/terms"
              className="text-white/30 no-underline hover:text-white/60 transition-colors"
              style={{ ...CN, fontSize: "0.8rem" }}
            >
              {footer.termsLink}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
