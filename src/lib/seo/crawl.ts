import * as cheerio from "cheerio";

const USER_AGENT =
  "AiMarketingDashboard/0.1 (+self-hosted SEO audit; contact: site owner)";
const FETCH_TIMEOUT_MS = 20_000;
/**
 * Deliberately gentle. Hosted platforms (Shopify in particular) throttle a
 * burst of parallel requests, and a 429 caused by our own crawl would be
 * reported as "your page is broken" — a false finding that reads as urgent.
 */
const CONCURRENCY = 2;
const POLITENESS_DELAY_MS = 300;
const THROTTLE_RETRIES = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PageSnapshot = {
  url: string;
  ok: boolean;
  status: number | null;
  /** Set when the response landed on a different URL than requested. */
  finalUrl: string | null;
  fetchMs: number;
  error: string | null;
  /** The host throttled us even after backing off — not a site defect. */
  rateLimited: boolean;

  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2Count: number;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  viewport: string | null;

  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;

  /** @type values found in JSON-LD blocks. */
  jsonLdTypes: string[];
  jsonLdInvalid: number;

  images: number;
  imagesMissingAlt: number;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  hreflang: { lang: string; href: string }[];
};

export type SiteFiles = {
  robotsTxt: string | null;
  robotsStatus: number | null;
  sitemapUrls: string[];
  /** Sitemap declared in robots.txt but not fetchable. */
  brokenSitemaps: string[];
};

type FetchOutcome = {
  status: number | null;
  body: string | null;
  finalUrl: string | null;
  ms: number;
  error: string | null;
  rateLimited: boolean;
};

/** `Retry-After` is either seconds or an HTTP date. */
function retryAfterMs(header: string | null, attempt: number): number {
  const fallback = 1_500 * 2 ** attempt;
  if (!header) return fallback;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 15_000);

  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 15_000);

  return fallback;
}

async function fetchText(url: string): Promise<FetchOutcome> {
  const started = Date.now();

  for (let attempt = 0; attempt <= THROTTLE_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });

      // Back off and retry rather than recording a throttle as a page defect.
      if ((res.status === 429 || res.status === 503) && attempt < THROTTLE_RETRIES) {
        await sleep(retryAfterMs(res.headers.get("retry-after"), attempt));
        continue;
      }

      const body = res.ok ? await res.text() : null;
      return {
        status: res.status,
        body,
        finalUrl: res.url || null,
        ms: Date.now() - started,
        error: res.ok ? null : `HTTP ${res.status}`,
        rateLimited: res.status === 429 || res.status === 503,
      };
    } catch (error) {
      const cause = (error as { cause?: { code?: string } })?.cause;
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: null,
        body: null,
        finalUrl: null,
        ms: Date.now() - started,
        error: cause?.code ? `${message} (${cause.code})` : message,
        rateLimited: false,
      };
    }
  }

  return {
    status: 429,
    body: null,
    finalUrl: null,
    ms: Date.now() - started,
    error: "HTTP 429 after retries",
    rateLimited: true,
  };
}

function emptySnapshot(url: string): PageSnapshot {
  return {
    url,
    ok: false,
    status: null,
    finalUrl: null,
    fetchMs: 0,
    error: null,
    rateLimited: false,
    title: null,
    metaDescription: null,
    h1: [],
    h2Count: 0,
    canonical: null,
    robotsMeta: null,
    lang: null,
    viewport: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    twitterCard: null,
    jsonLdTypes: [],
    jsonLdInvalid: 0,
    images: 0,
    imagesMissingAlt: 0,
    wordCount: 0,
    internalLinks: 0,
    externalLinks: 0,
    hreflang: [],
  };
}

function collectJsonLdTypes(raw: string, types: Set<string>) {
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") types.add(type);
    else if (Array.isArray(type)) type.filter((t) => typeof t === "string").forEach((t) => types.add(t as string));
    // @graph and nested entities carry types too.
    Object.values(record).forEach(visit);
  };
  visit(JSON.parse(raw));
}

export function parseHtml(url: string, html: string): PageSnapshot {
  const snapshot = emptySnapshot(url);
  const $ = cheerio.load(html);

  const attr = (selector: string, name = "content") =>
    $(selector).first().attr(name)?.trim() || null;

  snapshot.title = $("head title").first().text().trim() || null;
  snapshot.metaDescription = attr('meta[name="description" i]');
  snapshot.canonical = attr('link[rel="canonical" i]', "href");
  snapshot.robotsMeta = attr('meta[name="robots" i]');
  snapshot.lang = $("html").attr("lang")?.trim() || null;
  snapshot.viewport = attr('meta[name="viewport" i]');

  snapshot.ogTitle = attr('meta[property="og:title" i]');
  snapshot.ogDescription = attr('meta[property="og:description" i]');
  snapshot.ogImage = attr('meta[property="og:image" i]');
  snapshot.twitterCard = attr('meta[name="twitter:card" i]');

  snapshot.h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  snapshot.h2Count = $("h2").length;

  const jsonLdTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      collectJsonLdTypes(raw, jsonLdTypes);
    } catch {
      snapshot.jsonLdInvalid++;
    }
  });
  snapshot.jsonLdTypes = [...jsonLdTypes];

  const images = $("img");
  snapshot.images = images.length;
  snapshot.imagesMissingAlt = images.filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt.trim() === "";
  }).length;

  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  // Counts CJK characters individually since they aren't whitespace-delimited.
  const cjk = (text.match(/[一-鿿぀-ヿ]/g) ?? []).length;
  const latin = text
    .replace(/[一-鿿぀-ヿ]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
  snapshot.wordCount = cjk + latin;

  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    /* keep null */
  }

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    try {
      const resolved = new URL(href, url);
      if (origin && resolved.origin === origin) snapshot.internalLinks++;
      else snapshot.externalLinks++;
    } catch {
      /* unparseable href */
    }
  });

  $('link[rel="alternate" i][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang")?.trim();
    const href = $(el).attr("href")?.trim();
    if (lang && href) snapshot.hreflang.push({ lang, href });
  });

  return snapshot;
}

/** Fetch and parse pages with bounded concurrency, never throwing per page. */
export async function crawlPages(urls: string[]): Promise<PageSnapshot[]> {
  const results: PageSnapshot[] = new Array(urls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];
      const { status, body, finalUrl, ms, error, rateLimited } = await fetchText(url);

      if (!body) {
        results[index] = {
          ...emptySnapshot(url),
          status,
          fetchMs: ms,
          error,
          finalUrl,
          rateLimited,
        };
      } else {
        try {
          const snapshot = parseHtml(url, body);
          results[index] = {
            ...snapshot,
            ok: true,
            status,
            fetchMs: ms,
            finalUrl: finalUrl && finalUrl !== url ? finalUrl : null,
          };
        } catch (parseError) {
          results[index] = {
            ...emptySnapshot(url),
            status,
            fetchMs: ms,
            finalUrl,
            error: `parse failed: ${parseError instanceof Error ? parseError.message : parseError}`,
          };
        }
      }

      // Space out requests so we don't trip the host's rate limiter.
      if (cursor < urls.length) await sleep(POLITENESS_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}

/** robots.txt plus whatever sitemaps it points at (spec §5.2 evidence). */
export async function fetchSiteFiles(origin: string): Promise<SiteFiles> {
  const robots = await fetchText(new URL("/robots.txt", origin).toString());

  const result: SiteFiles = {
    robotsTxt: robots.body,
    robotsStatus: robots.status,
    sitemapUrls: [],
    brokenSitemaps: [],
  };

  const declared = (robots.body ?? "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
    .filter((v): v is string => Boolean(v));

  // Fall back to the conventional location when robots.txt declares nothing.
  const candidates = declared.length
    ? declared
    : [new URL("/sitemap.xml", origin).toString()];

  for (const candidate of candidates.slice(0, 5)) {
    const res = await fetchText(candidate);
    if (res.body) result.sitemapUrls.push(candidate);
    else result.brokenSitemaps.push(candidate);
  }

  return result;
}
