/**
 * Outbound email via Resend.
 *
 * Called over plain fetch rather than the SDK: this is one POST with a JSON
 * body, and the last two deployment failures in this project both came from
 * lockfile churn, so a dependency that buys nothing is not worth adding.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

export class EmailConfigError extends Error {}

export type SendResult = { id: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * The address reports are sent from.
 *
 * Resend only accepts a domain you have verified with it, so this has no safe
 * default — a guess would fail at send time with a message that points at the
 * address rather than at the missing configuration.
 */
function from(): string {
  const value = process.env.EMAIL_FROM;
  if (!value) {
    throw new EmailConfigError(
      "EMAIL_FROM is not set. It must use a domain verified in Resend, e.g. " +
        '"ROARLAND <dash@roarland.net>".',
    );
  }
  return value;
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailConfigError(
      "RESEND_API_KEY is not set — add it to .env (see docs/email-setup.md).",
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: from(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    // Resend puts the useful part in `message`; the bare status is not
    // actionable ("validation_error" vs. "domain is not verified").
    throw new Error(
      `Resend rejected the message (${response.status}): ${body?.message ?? "no detail"}`,
    );
  }

  if (!body?.id) throw new Error("Resend accepted the message but returned no id.");
  return { id: body.id };
}
