import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/env";
import { googleRedirectUri } from "@/lib/integrations/google/oauth";
import { GoogleConnectButton } from "@/components/google-connect-button";
import { Card } from "@/components/ui";

const ERROR_COPY: Record<string, string> = {
  google_not_configured:
    "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Add them to .env and restart the dev server.",
  state_mismatch:
    "The sign-in link expired or was opened in a different browser. Please try again.",
  missing_code: "Google did not return an authorization code. Please try again.",
  google_unreachable:
    "The server could not reach Google. Your browser reaches Google through a proxy, but Node does not use it automatically — start the app with `npm run dev` (which sets NODE_USE_ENV_PROXY=1) and make sure HTTPS_PROXY is set in your shell.",
  token_exchange_failed:
    "Google rejected the authorization code. The exact reason from Google is below.",
  search_console_scope_declined:
    "Search Console access was declined. The dashboard needs the read-only Search Console scope to show any data.",
  access_denied: "Sign-in was cancelled.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");

  const { error, detail } = await searchParams;
  const configured = isGoogleConfigured();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">AI Marketing Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in with the Google account that owns your Search Console properties.
        </p>
      </div>

      <Card className="p-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-line bg-panel-alt px-3 py-2">
            <p className="text-sm text-neg">
              {ERROR_COPY[error] ?? `Sign-in failed: ${error}`}
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
              label="Continue with Google"
              className="w-full"
            />
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Requests read-only Search Console access plus your name and email. Tokens are
              encrypted with AES-256-GCM before they touch the database and never reach the
              browser.
            </p>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-medium">Google OAuth isn&apos;t configured yet.</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted">
              <li>
                Enable the <strong>Google Search Console API</strong> in a Google Cloud project.
              </li>
              <li>
                Create an OAuth client of type <strong>Web application</strong>.
              </li>
              <li>
                Add this exact authorized redirect URI:
                <code className="mt-1 block rounded bg-panel-alt px-2 py-1 font-mono text-xs break-all">
                  {googleRedirectUri()}
                </code>
              </li>
              <li>
                Put the client ID and secret in <code className="font-mono">.env</code>, then
                restart <code className="font-mono">npm run dev</code>.
              </li>
            </ol>
            <p className="text-xs text-muted">
              Full walkthrough is in <code className="font-mono">docs/google-oauth-setup.md</code>.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}
