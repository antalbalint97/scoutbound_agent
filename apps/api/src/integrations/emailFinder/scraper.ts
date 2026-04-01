/**
 * Lightweight fallback email finder.
 *
 * When the tinyfish agent returns no email addresses for a company, this module
 * independently fetches common contact/impressum page candidates and extracts
 * mailto: hrefs and plaintext email addresses from the raw HTML.
 *
 * No headless browser is required — mailto: links and visible email addresses
 * are present in the static HTML of most business sites.
 */

const CONTACT_PATH_CANDIDATES = [
  "/contact",
  "/contact-us",
  "/contact-me",
  "/contactus",
  "/get-in-touch",
  "/reach-us",
  "/about",
  "/about-us",
  "/impressum",
  "/kontakt",
  "/kapcsolat",
  "/legal",
];

const FETCH_TIMEOUT_MS = 6_000;
const MAX_PAGES_TO_FETCH = 5;

// Matches standard email addresses in text or attribute values.
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

// Common false positives found in HTML/CSS source.
const FALSE_POSITIVE_PATTERNS = [
  /@\d+x\b/,           // @2x image descriptors
  /@media\b/i,         // CSS @media
  /\.(?:png|jpg|jpeg|gif|svg|webp|css|js)@/i,
  /example\.com$/i,
  /yourdomain/i,
  /placeholder/i,
  /sentry\.io/i,
  /amplitude\.com/i,
  /segment\.io/i,
  /cloudfront\.net/i,
];

function isLikelyRealEmail(email: string): boolean {
  if (email.includes("..")) return false;
  if (email.startsWith(".") || email.endsWith(".")) return false;
  return !FALSE_POSITIVE_PATTERNS.some((pattern) => pattern.test(email));
}

function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>();

  // 1. mailto: href attributes — most reliable
  const mailtoRe = /href=["']mailto:([^"'?\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRe.exec(html)) !== null) {
    const raw = match[1]?.trim().toLowerCase();
    if (raw && isLikelyRealEmail(raw)) {
      found.add(raw);
    }
  }

  // 2. Plaintext email patterns — catches footer / contact page text
  const plainMatches = html.match(EMAIL_PATTERN) ?? [];
  for (const raw of plainMatches) {
    const email = raw.toLowerCase().trim();
    if (isLikelyRealEmail(email)) {
      found.add(email);
    }
  }

  return [...found];
}

async function fetchPageHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Scoutbound/1.0; +https://scoutbound.app)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface EmailScrapeResult {
  emails: string[];
  pagesChecked: string[];
  pagesWithEmails: string[];
}

/**
 * Finds contact emails for a company website by fetching common contact/impressum
 * page candidates and extracting email addresses from the HTML.
 *
 * Runs up to MAX_PAGES_TO_FETCH pages in parallel with individual timeouts.
 * Returns unique emails sorted by likelihood (mailto: hrefs first, then plaintext).
 */
export async function findContactEmails(
  websiteUrl: string,
  knownContactPageUrl?: string | null,
): Promise<EmailScrapeResult> {
  let baseOrigin: string;

  try {
    baseOrigin = new URL(websiteUrl).origin;
  } catch {
    return { emails: [], pagesChecked: [], pagesWithEmails: [] };
  }

  const candidateUrls: string[] = [];

  // Known contact page from agent inspection takes priority
  if (knownContactPageUrl) {
    candidateUrls.push(knownContactPageUrl);
  }

  // Common contact page paths
  for (const path of CONTACT_PATH_CANDIDATES) {
    const url = `${baseOrigin}${path}`;
    if (!candidateUrls.includes(url)) {
      candidateUrls.push(url);
    }
  }

  const urlsToFetch = candidateUrls.slice(0, MAX_PAGES_TO_FETCH);

  console.log(
    `[emailFinder] checking ${urlsToFetch.length} pages for ${baseOrigin}`,
  );

  const htmlResults = await Promise.all(
    urlsToFetch.map(async (url) => ({ url, html: await fetchPageHtml(url) })),
  );

  const allEmails = new Set<string>();
  const pagesChecked: string[] = [];
  const pagesWithEmails: string[] = [];

  for (const { url, html } of htmlResults) {
    if (html === null) continue;
    pagesChecked.push(url);

    const found = extractEmailsFromHtml(html);
    if (found.length > 0) {
      pagesWithEmails.push(url);
      for (const email of found) {
        allEmails.add(email);
      }
    }
  }

  return {
    emails: [...allEmails],
    pagesChecked,
    pagesWithEmails,
  };
}
