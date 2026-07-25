import { buttonClass } from "./ui";

/**
 * Starts the Google OAuth flow.
 *
 * Deliberately a plain anchor, not next/link: the target is a route handler
 * that answers with a 302 to accounts.google.com. Client-side navigation
 * cannot follow a cross-origin redirect, so this has to be a full document
 * navigation. The lint rule assumes any /api path is a page route.
 */
export function GoogleConnectButton({
  returnTo,
  label,
  variant = "primary",
  className,
}: {
  returnTo: string;
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const href = `/api/connections/google/start?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <a href={href} className={buttonClass(variant, className)}>
      {label}
    </a>
  );
}
