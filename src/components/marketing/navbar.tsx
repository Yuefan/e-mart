"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LocaleToggle } from "@/components/locale-toggle";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function MarketingNavbar({ t }: { t: Dictionary }) {
  const [scrolled, setScrolled] = useState(false);
  const nav = t.marketing.nav;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 bg-panel transition-all duration-300 ${
        scrolled ? "shadow-md border-b border-line" : "border-b border-transparent"
      }`}
    >
      <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-8 flex items-center justify-between h-[80px]">
        <a href="https://roarland.ai" className="flex items-center gap-4">
          <Image
            src="/logos/ROARLAND-Logo5-transparent.png"
            alt="ROARLAND"
            width={360}
            height={83}
            className="h-14 w-auto"
            priority
            unoptimized
          />
        </a>

        <ul className="hidden md:flex gap-10 list-none m-0 p-0">
          {nav.links.map((link) => (
            <li key={link.hash}>
              <a
                href={`#${link.hash}`}
                className="text-muted text-lg tracking-wide hover:text-fg transition-colors no-underline font-medium"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-5">
          <LocaleToggle className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className="bg-accent text-white px-6 py-2.5 text-sm font-bold tracking-wider hover:opacity-90 transition-opacity no-underline"
          >
            {nav.cta}
          </Link>
        </div>
      </div>
    </nav>
  );
}
