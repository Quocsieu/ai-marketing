"use strict";

const net = require("node:net");
const dns = require("node:dns/promises");

/**
 * Creates an Error object with HTTP status and machine-readable error code.
 */
function createError(message, status = 400, code = "BAD_REQUEST") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Validates target URL syntax and ensures protocol is strictly http: or https:.
 */
function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw createError("URL is required and must be a non-empty string", 400, "INVALID_URL");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw createError(`Invalid URL format: '${rawUrl}'`, 400, "INVALID_URL");
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw createError(`Unsupported protocol '${protocol}'. Only http: and https: are allowed.`, 400, "INVALID_PROTOCOL");
  }
  return parsed;
}

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * multicast, or cloud metadata ranges (SSRF protection).
 */
function isBlockedIp(ip) {
  if (typeof ip !== "string") return true;
  const trimmed = ip.trim();
  const version = net.isIP(trimmed);
  if (!version) return false;

  if (version === 4) {
    const parts = trimmed.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (Loopback)
    if (a === 10) return true; // 10.0.0.0/8 (Private A)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (Private B)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (Private C)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (Multicast)
    if (a >= 240 && a <= 255) return true; // 240.0.0.0/4 (Reserved)
    return false;
  }

  if (version === 6) {
    const lower = trimmed.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // Loopback / unspecified

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    const v4Mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) {
      return isBlockedIp(v4Mapped[1]);
    }

    // Unique Local Addresses: fc00::/7 (fc00:: - fdff::)
    if (/^f[cd][0-9a-f]{2}:/i.test(lower) || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }

    // Link-local Unicast: fe80::/10 (fe80:: - febf::)
    if (/^fe[89ab][0-9a-f]:/i.test(lower) || /^fe[89ab]::/i.test(lower)) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Default DNS resolver using Node's dns.promises.lookup.
 */
async function defaultDnsLookup(hostname) {
  try {
    const res = await dns.lookup(hostname, { all: true });
    return res.map((r) => r.address);
  } catch (err) {
    throw createError(`DNS lookup failed for hostname '${hostname}'`, 400, "DNS_LOOKUP_FAILED");
  }
}

/**
 * Validates an URL object against SSRF risks.
 */
async function validateSsrf(urlObj, dnsLookupFn = defaultDnsLookup) {
  const hostname = urlObj.hostname.toLowerCase();

  // Reject localhost and *.localhost
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw createError("Access to localhost is blocked (SSRF protection)", 400, "SSRF_BLOCKED");
  }

  // If hostname is already an IP address
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw createError(`Target IP address '${hostname}' is restricted (SSRF protection)`, 400, "SSRF_BLOCKED");
    }
    return;
  }

  // Resolve hostname via DNS
  const addresses = await dnsLookupFn(hostname);
  if (!addresses || addresses.length === 0) {
    throw createError(`DNS lookup returned no addresses for '${hostname}'`, 400, "DNS_LOOKUP_FAILED");
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw createError(`Target address '${addr}' is restricted (SSRF protection)`, 400, "SSRF_BLOCKED");
    }
  }
}

/**
 * Reads response body stream chunk-by-chunk with a strict maximum byte limit.
 */
async function readResponseBody(response, maxBytes = 2 * 1024 * 1024) {
  if (!response.body) {
    if (typeof response.text === "function") {
      const text = await response.text();
      const byteSize = Buffer.byteLength(text, "utf8");
      if (byteSize > maxBytes) {
        throw createError("Response payload exceeds 2MB limit", 413, "PAYLOAD_TOO_LARGE");
      }
      return { text, byteSize };
    }
    return { text: "", byteSize: 0 };
  }

  // Web Streams API (ReadableStream getReader)
  if (typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    const decoder = new TextDecoder("utf-8");

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel("PAYLOAD_TOO_LARGE");
          } catch {}
          throw createError("Response payload exceeds 2MB limit", 413, "PAYLOAD_TOO_LARGE");
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return { text: chunks.join(""), byteSize: totalBytes };
    } catch (err) {
      if (err.code === "PAYLOAD_TOO_LARGE") throw err;
      throw err;
    }
  }

  // Node async iterator stream
  if (Symbol.asyncIterator in response.body) {
    const chunks = [];
    let totalBytes = 0;
    const decoder = new TextDecoder("utf-8");
    for await (const chunk of response.body) {
      const len = chunk.byteLength || chunk.length || 0;
      totalBytes += len;
      if (totalBytes > maxBytes) {
        throw createError("Response payload exceeds 2MB limit", 413, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
    chunks.push(decoder.decode());
    return { text: chunks.join(""), byteSize: totalBytes };
  }

  // Fallback to response.text()
  if (typeof response.text === "function") {
    const text = await response.text();
    const byteSize = Buffer.byteLength(text, "utf8");
    if (byteSize > maxBytes) {
      throw createError("Response payload exceeds 2MB limit", 413, "PAYLOAD_TOO_LARGE");
    }
    return { text, byteSize };
  }

  return { text: "", byteSize: 0 };
}

/**
 * Decodes basic HTML entities.
 */
function unescapeHtml(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

/**
 * Strips HTML tags and collapses redundant whitespace.
 */
function cleanText(raw) {
  if (!raw || typeof raw !== "string") return "";
  return unescapeHtml(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/**
 * Extracts on-page SEO metadata, headings, links, robots directives,
 * and JSON-LD structured data from raw HTML without external libraries.
 */
function parseHtmlMetadata(html, finalUrl) {
  const notices = [];
  let finalUrlObj;
  try {
    finalUrlObj = new URL(finalUrl);
  } catch {
    finalUrlObj = { hostname: "" };
  }

  // 1. Title: first <title>...</title>
  let title = null;
  const titleMatch = html.match(/<title(?:\s+[^>]*)?>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const candidate = cleanText(titleMatch[1]);
    if (candidate) title = candidate;
  }

  // 2. Meta description
  let metaDescription = null;
  const descMatch =
    html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  if (descMatch) {
    const candidate = cleanText(descMatch[1]);
    if (candidate) metaDescription = candidate;
  }

  // 3. Canonical link
  let canonicalUrl = null;
  const canonMatch =
    html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (canonMatch) {
    const rawCanon = canonMatch[1].trim();
    try {
      canonicalUrl = new URL(rawCanon, finalUrl).toString();
    } catch {
      canonicalUrl = rawCanon;
    }
  }

  // Canonical match check (ignoring trailing slash)
  const isCanonicalMatch = canonicalUrl
    ? canonicalUrl.replace(/\/$/, "") === finalUrl.replace(/\/$/, "")
    : null;

  // 4. Page-level Robots Meta Directives
  let robotsDirectives = {
    indexable: true,
    noindex: false,
    nofollow: false,
    raw: null,
  };
  const robotsMatch =
    html.match(/<meta\s+[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']robots["'][^>]*>/i);
  if (robotsMatch) {
    const raw = robotsMatch[1].trim();
    const lower = raw.toLowerCase();
    const noindex = lower.includes("noindex");
    const nofollow = lower.includes("nofollow");
    robotsDirectives = {
      indexable: !noindex,
      noindex,
      nofollow,
      raw,
    };
  }

  // 5. Headings: h1 through h6
  const headings = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    const re = new RegExp(`<h${lvl}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/h${lvl}>`, "gi");
    const list = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const txt = cleanText(m[1]);
      if (txt) list.push(txt);
    }
    headings[`h${lvl}Count`] = list.length;
    headings[`h${lvl}List`] = list;
  }

  // 6. Links: internal vs external, resolved against finalUrl
  const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const internalMap = new Map();
  const externalMap = new Map();
  let lMatch;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    const rawHref = (lMatch[1] || "").trim();
    const anchorText = cleanText(lMatch[2]);
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      continue;
    }
    try {
      const resolved = new URL(rawHref, finalUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        continue;
      }
      const fullUrl = resolved.toString();
      const isInternal = resolved.hostname.toLowerCase() === finalUrlObj.hostname.toLowerCase();
      const targetMap = isInternal ? internalMap : externalMap;
      if (!targetMap.has(fullUrl)) {
        targetMap.set(fullUrl, anchorText);
      }
    } catch {}
  }

  const sampleInternalLinks = Array.from(internalMap.entries())
    .map(([url, anchorText]) => ({ url, anchorText }))
    .sort((a, b) => a.url.localeCompare(b.url))
    .slice(0, 10);

  const sampleExternalLinks = Array.from(externalMap.entries())
    .map(([url, anchorText]) => ({ url, anchorText }))
    .sort((a, b) => a.url.localeCompare(b.url))
    .slice(0, 10);

  // 7. Structured Data: JSON-LD
  const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let hasJsonLd = false;
  const detectedTypesSet = new Set();
  let sMatch;

  function extractType(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(extractType);
    } else {
      if (node["@type"]) {
        if (typeof node["@type"] === "string") detectedTypesSet.add(node["@type"]);
        else if (Array.isArray(node["@type"])) {
          node["@type"].forEach((t) => typeof t === "string" && detectedTypesSet.add(t));
        }
      }
      for (const key of Object.keys(node)) {
        if (typeof node[key] === "object") extractType(node[key]);
      }
    }
  }

  while ((sMatch = jsonLdRegex.exec(html)) !== null) {
    hasJsonLd = true;
    try {
      const parsed = JSON.parse(sMatch[1]);
      extractType(parsed);
    } catch {
      notices.push("Malformed JSON-LD detected in document");
    }
  }

  return {
    metadata: {
      title,
      titleLength: title ? title.length : 0,
      metaDescription,
      metaDescriptionLength: metaDescription ? metaDescription.length : 0,
      canonicalUrl,
      isCanonicalMatch,
      robotsDirectives,
    },
    headings,
    links: {
      internalLinkCount: internalMap.size,
      externalLinkCount: externalMap.size,
      sampleInternalLinks,
      sampleExternalLinks,
    },
    structuredData: {
      detectedTypes: Array.from(detectedTypesSet).sort(),
      hasJsonLd,
    },
    factsAndDiagnostics: {
      hasTitle: !!title,
      hasMetaDescription: !!metaDescription,
      hasCanonical: !!canonicalUrl,
      hasH1: headings.h1Count > 0,
      multipleH1: headings.h1Count > 1,
      notices,
    },
  };
}

/**
 * Performs a manual-redirect, SSRF-validated HTTP GET fetch.
 */
async function safeFetchWithRedirects(initialUrl, options = {}) {
  const maxRedirects = 5;
  const rawTimeout = options.timeoutMs !== undefined ? options.timeoutMs : 10000;
  const timeoutMs = Math.min(Math.max(1, rawTimeout), 15000);
  const fetchFn = options.fetch || globalThis.fetch;
  const dnsLookupFn = options.dnsLookup || defaultDnsLookup;

  let currentUrl = initialUrl;
  let redirectCount = 0;
  const startTime = Date.now();

  while (true) {
    const parsedUrl = validateUrl(currentUrl);
    await validateSsrf(parsedUrl, dnsLookupFn);

    let response;
    try {
      response = await fetchFn(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "MarketPilotAI-SeoBot/1.0 (+https://marketpilot.ai/bot)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError" || String(err.message || "").toLowerCase().includes("timeout")) {
        throw createError(`Request timed out after ${timeoutMs}ms`, 408, "TIMEOUT_EXCEEDED");
      }
      throw err;
    }

    // Check for redirect status
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw createError("Maximum redirect limit (5) exceeded", 400, "REDIRECT_LIMIT_EXCEEDED");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw createError("Redirect response missing Location header", 400, "INVALID_REDIRECT");
      }
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        throw createError(`Invalid redirect Location: '${location}'`, 400, "INVALID_URL");
      }
      continue;
    }

    const durationMs = Date.now() - startTime;
    return {
      response,
      finalUrl: currentUrl,
      redirectCount,
      durationMs,
    };
  }
}

/**
 * Public API: Scrapes and extracts SEO signals from a single HTTP/HTTPS URL.
 *
 * @param {string} targetUrl - URL to fetch and analyze
 * @param {Object} [options={}] - Options (timeoutMs, fetch, dnsLookup, maxBytes)
 * @returns {Promise<Object>} Normalized factual SEO data
 */
async function scrapeSeoPage(targetUrl, options = {}) {
  const scrapedAt = new Date().toISOString();
  const parsedTarget = validateUrl(targetUrl);

  const { response, finalUrl, redirectCount, durationMs } = await safeFetchWithRedirects(parsedTarget.toString(), options);

  const statusCode = response.status;
  const rawContentType = response.headers.get("content-type") || "";
  const contentType = rawContentType.toLowerCase();

  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  const { text: htmlContent, byteSize } = await readResponseBody(response, maxBytes);

  const isHtml = contentType.startsWith("text/html");
  if (!isHtml) {
    return {
      request: {
        targetUrl: parsedTarget.toString(),
        scrapedAt,
      },
      http: {
        finalUrl,
        statusCode,
        contentType: contentType ? contentType.split(";")[0].trim() : null,
        durationMs,
        byteSize,
        redirectCount,
      },
      metadata: {
        title: null,
        titleLength: 0,
        metaDescription: null,
        metaDescriptionLength: 0,
        canonicalUrl: null,
        isCanonicalMatch: null,
        robotsDirectives: {
          indexable: true,
          noindex: false,
          nofollow: false,
          raw: null,
        },
      },
      headings: {
        h1Count: 0,
        h1List: [],
        h2Count: 0,
        h2List: [],
        h3Count: 0,
        h3List: [],
        h4Count: 0,
        h4List: [],
        h5Count: 0,
        h5List: [],
        h6Count: 0,
        h6List: [],
      },
      links: {
        internalLinkCount: 0,
        externalLinkCount: 0,
        sampleInternalLinks: [],
        sampleExternalLinks: [],
      },
      structuredData: {
        detectedTypes: [],
        hasJsonLd: false,
      },
      factsAndDiagnostics: {
        hasTitle: false,
        hasMetaDescription: false,
        hasCanonical: false,
        hasH1: false,
        multipleH1: false,
        notices: [`Response content-type is '${rawContentType || "unknown"}', not 'text/html'; skipping HTML parsing.`],
      },
    };
  }

  const parsed = parseHtmlMetadata(htmlContent, finalUrl);

  return {
    request: {
      targetUrl: parsedTarget.toString(),
      scrapedAt,
    },
    http: {
      finalUrl,
      statusCode,
      contentType: contentType.split(";")[0].trim(),
      durationMs,
      byteSize,
      redirectCount,
    },
    metadata: parsed.metadata,
    headings: parsed.headings,
    links: parsed.links,
    structuredData: parsed.structuredData,
    factsAndDiagnostics: parsed.factsAndDiagnostics,
  };
}

module.exports = {
  createError,
  validateUrl,
  isBlockedIp,
  validateSsrf,
  readResponseBody,
  parseHtmlMetadata,
  safeFetchWithRedirects,
  scrapeSeoPage,
};
