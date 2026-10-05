"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const seoScraper = require("../src/services/seo/seoScraperService");

/**
 * Creates a mock Response object for testing safeFetchWithRedirects and scrapeSeoPage.
 */
function createMockResponse({
  status = 200,
  headers = {},
  body = "",
  stream = null,
}) {
  const headerMap = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  if (!headerMap.has("content-type")) {
    headerMap.set("content-type", "text/html; charset=utf-8");
  }

  const res = {
    status,
    headers: {
      get: (h) => headerMap.get(h.toLowerCase()) || null,
    },
  };

  if (stream) {
    res.body = stream;
  } else {
    res.text = async () => body;
  }

  return res;
}

const mockPublicDns = async () => ["93.184.216.34"];

describe("SEO Scraper Foundation Suite", () => {
  // 1. valid HTTPS page
  test("1. valid HTTPS page scrapes successfully and populates HTTP/request info", async () => {
    const mockHtml = "<html><head><title>My Store</title></head><body><h1>Welcome</h1></body></html>";
    const result = await seoScraper.scrapeSeoPage("https://example.com/shop", {
      dnsLookup: mockPublicDns,
      fetch: async (url) => {
        assert.equal(url, "https://example.com/shop");
        return createMockResponse({ body: mockHtml });
      },
    });

    assert.equal(result.request.targetUrl, "https://example.com/shop");
    assert.equal(result.http.finalUrl, "https://example.com/shop");
    assert.equal(result.http.statusCode, 200);
    assert.equal(result.http.contentType, "text/html");
    assert.equal(result.metadata.title, "My Store");
    assert.equal(result.headings.h1Count, 1);
    assert.deepEqual(result.headings.h1List, ["Welcome"]);
  });

  // 2. valid HTTP page
  test("2. valid HTTP page works with http: protocol", async () => {
    const mockHtml = "<html><head><title>Insecure Site</title></head><body><h2>Sub</h2></body></html>";
    const result = await seoScraper.scrapeSeoPage("http://example.org/news", {
      dnsLookup: mockPublicDns,
      fetch: async (url) => {
        assert.equal(url, "http://example.org/news");
        return createMockResponse({ body: mockHtml });
      },
    });

    assert.equal(result.request.targetUrl, "http://example.org/news");
    assert.equal(result.http.statusCode, 200);
    assert.equal(result.metadata.title, "Insecure Site");
  });

  // 3. invalid URL
  test("3. invalid URL throws INVALID_URL with 400 status", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("not-a-valid-url");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_URL");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_URL");
        return true;
      }
    );
  });

  // 4. invalid protocol
  test("4. invalid protocol throws INVALID_PROTOCOL (file:, ftp:, gopher:)", async () => {
    const invalidProtocols = [
      "file:///etc/passwd",
      "ftp://ftp.example.com/file",
      "javascript:alert(1)",
      "data:text/html,<h1>hi</h1>",
    ];

    for (const url of invalidProtocols) {
      await assert.rejects(
        async () => {
          await seoScraper.scrapeSeoPage(url);
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, "INVALID_PROTOCOL");
          return true;
        }
      );
    }
  });

  // 5. localhost blocked
  test("5. localhost hostname is blocked immediately", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://localhost:3000/api");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://sub.localhost/test");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 6. 127.0.0.1 blocked
  test("6. 127.0.0.1 loopback IP is blocked", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://127.0.0.1/admin");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );

    // Also when hostname resolves to 127.0.0.1
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://spoof.domain/test", {
          dnsLookup: async () => ["127.0.0.1"],
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 7. 10.0.0.1 blocked
  test("7. 10.0.0.1 private class A IP is blocked", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://10.0.0.1/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 8. 192.168.1.1 blocked
  test("8. 192.168.1.1 private class C IP is blocked", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://192.168.1.1:8443/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 9. 172.16.0.1 blocked
  test("9. 172.16.0.1 private class B IP is blocked (172.16 to 172.31)", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://172.16.0.1/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://172.31.255.254/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 10. 169.254.169.254 blocked
  test("10. 169.254.169.254 cloud metadata endpoint is blocked", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://169.254.169.254/latest/meta-data/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 11. ::1 blocked
  test("11. ::1 IPv6 loopback is blocked", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("http://[::1]/");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 12. IPv4-mapped IPv6 blocked
  test("12. IPv4-mapped IPv6 representations of private IPs are blocked", async () => {
    assert.equal(seoScraper.isBlockedIp("::ffff:127.0.0.1"), true);
    assert.equal(seoScraper.isBlockedIp("::ffff:169.254.169.254"), true);
    assert.equal(seoScraper.isBlockedIp("::ffff:10.0.0.1"), true);
    assert.equal(seoScraper.isBlockedIp("::ffff:8.8.8.8"), false);
  });

  // 13. redirect to public URL works
  test("13. redirect to public URL is followed safely with manual redirect handling", async () => {
    let callCount = 0;
    const result = await seoScraper.scrapeSeoPage("http://example.com/old", {
      dnsLookup: mockPublicDns,
      fetch: async (url) => {
        callCount++;
        if (url === "http://example.com/old") {
          return createMockResponse({
            status: 301,
            headers: { location: "https://example.com/new" },
          });
        }
        return createMockResponse({
          status: 200,
          body: "<html><head><title>New Destination</title></head></html>",
        });
      },
    });

    assert.equal(callCount, 2);
    assert.equal(result.http.finalUrl, "https://example.com/new");
    assert.equal(result.http.redirectCount, 1);
    assert.equal(result.metadata.title, "New Destination");
  });

  // 14. redirect to private IP blocked
  test("14. redirect to private IP is intercepted and blocked with SSRF_BLOCKED", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://public-site.com/bounce", {
          dnsLookup: async (host) => {
            if (host === "public-site.com") return ["93.184.216.34"];
            return ["127.0.0.1"];
          },
          fetch: async (url) => {
            if (url === "https://public-site.com/bounce") {
              return createMockResponse({
                status: 302,
                headers: { location: "http://127.0.0.1:8080/internal" },
              });
            }
            return createMockResponse();
          },
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "SSRF_BLOCKED");
        return true;
      }
    );
  });

  // 15. redirect chain > 5 rejected
  test("15. redirect chain exceeding 5 hops is rejected with REDIRECT_LIMIT_EXCEEDED", async () => {
    let hop = 0;
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://example.com/hop0", {
          dnsLookup: mockPublicDns,
          fetch: async (url) => {
            hop++;
            return createMockResponse({
              status: 302,
              headers: { location: `https://example.com/hop${hop}` },
            });
          },
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "REDIRECT_LIMIT_EXCEEDED");
        return true;
      }
    );
    assert.equal(hop, 6);
  });

  // 16. timeout rejected
  test("16. request exceeding timeout limit is rejected with TIMEOUT_EXCEEDED", async () => {
    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://example.com/slow", {
          dnsLookup: mockPublicDns,
          timeoutMs: 50,
          fetch: async () => {
            const err = new Error("The operation was aborted due to timeout");
            err.name = "TimeoutError";
            throw err;
          },
        });
      },
      (err) => {
        assert.equal(err.status, 408);
        assert.equal(err.code, "TIMEOUT_EXCEEDED");
        return true;
      }
    );
  });

  // 17. payload > 2MB rejected
  test("17. payload exceeding 2MB is aborted with PAYLOAD_TOO_LARGE", async () => {
    const hugeChunk = new Uint8Array(1024 * 1024); // 1MB
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield hugeChunk;
        yield hugeChunk;
        yield hugeChunk; // 3MB total
      },
    };

    await assert.rejects(
      async () => {
        await seoScraper.scrapeSeoPage("https://example.com/huge", {
          dnsLookup: mockPublicDns,
          fetch: async () => {
            return createMockResponse({ stream });
          },
        });
      },
      (err) => {
        assert.equal(err.status, 413);
        assert.equal(err.code, "PAYLOAD_TOO_LARGE");
        return true;
      }
    );
  });

  // 18. non-HTML response handled safely
  test("18. non-HTML response returns safe factual output without crashing", async () => {
    const result = await seoScraper.scrapeSeoPage("https://example.com/data.json", {
      dnsLookup: mockPublicDns,
      fetch: async () => {
        return createMockResponse({
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: "value" }),
        });
      },
    });

    assert.equal(result.http.statusCode, 200);
    assert.equal(result.http.contentType, "application/json");
    assert.equal(result.metadata.title, null);
    assert.equal(result.headings.h1Count, 0);
    assert.ok(result.factsAndDiagnostics.notices.length > 0);
    assert.ok(result.factsAndDiagnostics.notices[0].includes("not 'text/html'"));
  });

  // 19. title extraction
  test("19. title extraction extracts first title tag, strips internal tags and decodes entities", () => {
    const html = "<head><title>  Best Shoes &amp; Boots  </title></head>";
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.metadata.title, "Best Shoes & Boots");
    assert.equal(parsed.metadata.titleLength, 18);
    assert.equal(parsed.factsAndDiagnostics.hasTitle, true);
  });

  // 20. meta description extraction
  test("20. meta description extraction handles attribute permutations and quotes", () => {
    const html1 = '<meta name="description" content="Shop the finest footwear online today.">';
    const parsed1 = seoScraper.parseHtmlMetadata(html1, "https://example.com");
    assert.equal(parsed1.metadata.metaDescription, "Shop the finest footwear online today.");
    assert.equal(parsed1.factsAndDiagnostics.hasMetaDescription, true);

    const html2 = '<meta content="Reverse order description" name="description">';
    const parsed2 = seoScraper.parseHtmlMetadata(html2, "https://example.com");
    assert.equal(parsed2.metadata.metaDescription, "Reverse order description");
  });

  // 21. canonical extraction
  test("21. canonical extraction resolves relative canonical URLs and checks canonical match", () => {
    const html = '<link rel="canonical" href="/canonical-path">';
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com/current-path");
    assert.equal(parsed.metadata.canonicalUrl, "https://example.com/canonical-path");
    assert.equal(parsed.metadata.isCanonicalMatch, false);

    const matchHtml = '<link rel="canonical" href="https://example.com/current-path/">';
    const parsedMatch = seoScraper.parseHtmlMetadata(matchHtml, "https://example.com/current-path");
    assert.equal(parsedMatch.metadata.isCanonicalMatch, true);
  });

  // 22. headings extraction
  test("22. headings extraction counts and lists h1 through h6 tags cleanly", () => {
    const html = `
      <h1>Main Headline <span>Highlight</span></h1>
      <h2>Feature 1</h2>
      <h2>Feature 2</h2>
      <h3>Sub feature</h3>
      <h4>Detail 4</h4>
      <h5>Minor 5</h5>
      <h6>Micro 6</h6>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.headings.h1Count, 1);
    assert.deepEqual(parsed.headings.h1List, ["Main Headline Highlight"]);
    assert.equal(parsed.headings.h2Count, 2);
    assert.deepEqual(parsed.headings.h2List, ["Feature 1", "Feature 2"]);
    assert.equal(parsed.headings.h3Count, 1);
    assert.equal(parsed.headings.h4Count, 1);
    assert.equal(parsed.headings.h5Count, 1);
    assert.equal(parsed.headings.h6Count, 1);
  });

  // 23. relative internal links
  test("23. relative internal links are resolved against target URL and classified as internal", () => {
    const html = `
      <a href="/pricing">Pricing</a>
      <a href="contact.html">Contact Us</a>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com/folder/index.html");
    assert.equal(parsed.links.internalLinkCount, 2);
    assert.equal(parsed.links.externalLinkCount, 0);
    assert.equal(parsed.links.sampleInternalLinks[0].url, "https://example.com/folder/contact.html");
    assert.equal(parsed.links.sampleInternalLinks[1].url, "https://example.com/pricing");
  });

  // 24. external links
  test("24. external links are recognized and separated from internal links", () => {
    const html = `
      <a href="https://partner.com/signup">Partner</a>
      <a href="https://example.com/home">Home</a>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.links.internalLinkCount, 1);
    assert.equal(parsed.links.externalLinkCount, 1);
    assert.equal(parsed.links.sampleExternalLinks[0].url, "https://partner.com/signup");
  });

  // 25. anchor text
  test("25. anchor text is trimmed, stripped of inner tags, and captured with link", () => {
    const html = '<a href="/demo"><b>Schedule</b> a <i>Demo</i> &amp; Tour</a>';
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.links.sampleInternalLinks[0].anchorText, "Schedule a Demo & Tour");
  });

  // 26. page-level robots meta
  test("26. page-level robots meta accurately reports noindex, nofollow, and indexable", () => {
    const htmlNoindex = '<meta name="robots" content="noindex, follow">';
    const parsed1 = seoScraper.parseHtmlMetadata(htmlNoindex, "https://example.com");
    assert.equal(parsed1.metadata.robotsDirectives.noindex, true);
    assert.equal(parsed1.metadata.robotsDirectives.nofollow, false);
    assert.equal(parsed1.metadata.robotsDirectives.indexable, false);

    const htmlAllow = '<meta name="robots" content="index, follow">';
    const parsed2 = seoScraper.parseHtmlMetadata(htmlAllow, "https://example.com");
    assert.equal(parsed2.metadata.robotsDirectives.noindex, false);
    assert.equal(parsed2.metadata.robotsDirectives.nofollow, false);
    assert.equal(parsed2.metadata.robotsDirectives.indexable, true);
  });

  // 27. valid JSON-LD
  test("27. valid JSON-LD structured data is parsed and @type values are extracted", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Widget",
          "brand": {
            "@type": "Brand",
            "name": "Acme"
          }
        }
      </script>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.structuredData.hasJsonLd, true);
    assert.deepEqual(parsed.structuredData.detectedTypes, ["Brand", "Product"]);
  });

  // 28. malformed JSON-LD does not crash
  test("28. malformed JSON-LD does not crash and adds a notice to diagnostics", () => {
    const html = '<script type="application/ld+json">{ broken json: true, }</script>';
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.structuredData.hasJsonLd, true);
    assert.deepEqual(parsed.structuredData.detectedTypes, []);
    assert.ok(parsed.factsAndDiagnostics.notices.some((n) => n.includes("Malformed JSON-LD")));
  });

  // 29. multiple H1 detection
  test("29. multiple H1 tags are detected and flagged in diagnostics", () => {
    const html = `
      <h1>First H1 Heading</h1>
      <p>Some text</p>
      <h1>Second H1 Heading</h1>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.equal(parsed.headings.h1Count, 2);
    assert.equal(parsed.factsAndDiagnostics.hasH1, true);
    assert.equal(parsed.factsAndDiagnostics.multipleH1, true);
  });

  // 30. deterministic output ordering
  test("30. deterministic output ordering: sample links and types are sorted consistently", () => {
    const html = `
      <a href="/zebra">Zebra</a>
      <a href="/apple">Apple</a>
      <a href="/banana">Banana</a>
      <script type="application/ld+json">
        [{ "@type": "WebPage" }, { "@type": "AboutPage" }]
      </script>
    `;
    const parsed = seoScraper.parseHtmlMetadata(html, "https://example.com");
    assert.deepEqual(
      parsed.links.sampleInternalLinks.map((l) => l.url),
      ["https://example.com/apple", "https://example.com/banana", "https://example.com/zebra"]
    );
    assert.deepEqual(parsed.structuredData.detectedTypes, ["AboutPage", "WebPage"]);
  });
});
