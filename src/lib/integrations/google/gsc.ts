const GSC_BASE = "https://www.googleapis.com/webmasters/v3";

export type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchAnalyticsQuery = {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  /** "final" excludes fresh, still-settling data; "all" includes it. */
  dataState?: "final" | "all";
};

class GscError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GscError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GSC allows 1200 QPM / 30k QPD. The worker calls this serially and backs off
 * exponentially on 429/5xx (spec §4.1).
 */
async function gscFetch(
  accessToken: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  let lastError: GscError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GSC_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if (res.ok) return res.json();

    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* keep raw text */
    }
    lastError = new GscError(`Search Console API ${res.status}: ${detail}`, res.status);

    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;

    // 1s, 2s, 4s, 8s (+ jitter)
    await sleep(2 ** (attempt - 1) * 1000 + Math.random() * 250);
  }

  throw lastError ?? new GscError("Search Console API failed", 500);
}

/** All properties the authorised account can read. */
export async function listProperties(accessToken: string): Promise<GscProperty[]> {
  const data = (await gscFetch(accessToken, "/sites")) as {
    siteEntry?: GscProperty[];
  };
  return data.siteEntry ?? [];
}

export async function searchAnalytics(
  accessToken: string,
  siteUrl: string,
  query: SearchAnalyticsQuery,
): Promise<GscRow[]> {
  const data = (await gscFetch(
    accessToken,
    `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", body: { dataState: "final", ...query } },
  )) as { rows?: GscRow[] };
  return data.rows ?? [];
}

/** `sc-domain:songolab.com` / `https://songolab.com/` -> `songolab.com` */
export function propertyToDomain(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl.slice("sc-domain:".length);
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}
