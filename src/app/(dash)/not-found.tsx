import Link from "next/link";
import { getT } from "@/lib/i18n";
import { Card, buttonClass } from "@/components/ui";

/**
 * Not-found inside the dashboard.
 *
 * Without this, `notFound()` from a site page falls through to the root
 * not-found, which renders outside this route group — so the sidebar and top
 * bar vanish and a stale or mistyped site id becomes a dead end with no way
 * back. Keeping it inside the group keeps the navigation on screen.
 */
export default async function DashboardNotFound() {
  const { t } = await getT();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Card className="px-6 py-10 text-center">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">404</p>
        <h1 className="mt-2 text-lg font-semibold">{t.notFound.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t.notFound.description}</p>
        <Link href="/" className={buttonClass("secondary", "mt-5")}>
          {t.notFound.backHome}
        </Link>
      </Card>
    </main>
  );
}
