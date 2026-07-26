"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A site's icon in the sidebar.
 *
 * The lettered badge renders first and always — it costs nothing and is never
 * blank. The real favicon is then attempted from the site's own origin and
 * swapped in only once it actually decodes, so a missing or slow icon degrades
 * to the badge instead of a broken-image box.
 *
 * Deliberately not a third-party favicon service: those work even when a site
 * has no icon, but they report every domain in this dashboard to that service
 * on each page load, which is a poor trade for a decorative 16px square.
 */
export function SiteIcon({
  domain,
  name,
  active,
}: {
  domain: string;
  name: string;
  active?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const letter = (name || domain).trim().charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        "relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded",
        !loaded && (active ? "bg-accent-soft text-accent" : "bg-panel-alt text-muted"),
      )}
      aria-hidden
    >
      {!loaded ? <span className="text-[10px] font-semibold">{letter}</span> : null}

      {/* Remote host, so next/image would need it whitelisted for no benefit at
          this size. no-referrer keeps the dashboard URL out of their logs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://${domain}/favicon.ico`}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={cn("absolute inset-0 size-5 object-contain", !loaded && "opacity-0")}
      />
    </span>
  );
}
