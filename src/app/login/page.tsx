import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { en } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/format";
import { googleRedirectUri } from "@/lib/integrations/google/oauth";
import { Brand } from "@/components/brand";
import { GoogleConnectButton } from "@/components/google-connect-button";
import { LocaleToggle } from "@/components/locale-toggle";
import { Card } from "@/components/ui";

type ErrorCode = Exclude<keyof typeof en.login.errors, "generic">;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");

  const { error, detail } = await searchParams;
  const configured = isGoogleConfigured();
  const { t } = await getT();

  // `generic` is the fallback template, not a code the callback can send, so it
  // is excluded from the lookup — otherwise ?error=generic would render the
  // uninterpolated "Sign-in failed: {code}".
  const known = error && error !== "generic" ? t.login.errors[error as ErrorCode] : undefined;
  const errorCopy = error ? (known ?? fmt(t.login.errors.generic, { code: error })) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Brand size="lg" />
          <p className="mt-3 text-sm text-muted">{t.login.intro}</p>
        </div>
        <LocaleToggle />
      </div>

      <Card className="p-6">
        {errorCopy ? (
          <div className="mb-4 rounded-lg border border-line bg-panel-alt px-3 py-2">
            <p className="text-sm text-neg">
              {errorCopy}
            </p>
            {detail ? (
              <p className="mt-1.5 font-mono text-xs break-all text-muted">{detail}</p>
            ) : null}
          </div>
        ) : null}

        {configured ? (
          <>
            <GoogleConnectButton
              returnTo="/connections"
              label={t.login.continueWithGoogle}
              className="w-full"
            />
            <p className="mt-4 text-xs leading-relaxed text-muted">{t.login.scopeNote}</p>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{t.login.notConfigured}</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted">
              <li>{t.login.step1}</li>
              <li>{t.login.step2}</li>
              <li>
                {t.login.step3}
                <code className="mt-1 block rounded bg-panel-alt px-2 py-1 font-mono text-xs break-all">
                  {googleRedirectUri()}
                </code>
              </li>
              <li>{t.login.step4}</li>
            </ol>
            <p className="text-xs text-muted">{t.login.walkthrough}</p>
          </div>
        )}
      </Card>
    </main>
  );
}
