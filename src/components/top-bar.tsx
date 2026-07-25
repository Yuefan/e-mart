"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonClass } from "./ui";

export type TopBarUser = {
  name: string | null;
  email: string;
  image: string | null;
};

function Avatar({ user, size = 28 }: { user: TopBarUser; size?: number }) {
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();

  if (user.image) {
    return (
      // Remote avatar from Google; next/image would need a configured host.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

/**
 * Persistent identity affordance. Previously the signed-in account only showed
 * in the sidebar footer, which is hidden entirely below the md breakpoint —
 * there was no way to tell which Google account the data belonged to.
 */
export function TopBar({
  user,
  connectionCount,
  needsAttention,
}: {
  user: TopBarUser;
  connectionCount: number;
  needsAttention: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-panel/95 px-6 backdrop-blur">
      <Link href="/" className="text-sm font-semibold md:hidden">
        AI Marketing
      </Link>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <Link
          href="/account"
          className="hidden items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg sm:flex"
        >
          {connectionCount} account{connectionCount === 1 ? "" : "s"}
          {needsAttention > 0 ? (
            <span className="rounded-md bg-panel-alt px-1.5 py-0.5 font-medium text-neg">
              {needsAttention} need{needsAttention === 1 ? "s" : ""} attention
            </span>
          ) : null}
        </Link>

        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              "flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 transition-colors",
              "hover:border-line hover:bg-panel-alt",
              open && "border-line bg-panel-alt",
            )}
          >
            <Avatar user={user} />
            <span className="hidden max-w-40 truncate text-sm sm:block">
              {user.name ?? user.email}
            </span>
            <span aria-hidden className="text-[10px] text-muted">
              ▾
            </span>
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Avatar user={user} size={36} />
                <div className="min-w-0">
                  {user.name ? (
                    <p className="truncate text-sm font-medium">{user.name}</p>
                  ) : null}
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
              </div>

              <nav className="py-1">
                <Link
                  href="/account"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-sm transition-colors hover:bg-panel-alt"
                >
                  Account & connected apps
                </Link>
                <Link
                  href="/connections"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-sm transition-colors hover:bg-panel-alt"
                >
                  Connections
                </Link>
              </nav>

              <form action="/api/auth/logout" method="post" className="border-t border-line p-1">
                <button
                  type="submit"
                  role="menuitem"
                  className={buttonClass("ghost", "w-full justify-start px-3 text-sm")}
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
