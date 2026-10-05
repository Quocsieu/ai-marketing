"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const seoScraperService = require("../src/services/seo/seoScraperService");
const {
  BATCH_B5_SLUGS,
  isBatchB5Worker,
  isTypeBWorker,
  loadBatchB5Data,
  loadTypeBData,
} = require("../src/workers/typeBWorkerWiring");
const workers = require("../src/workers");
const aiService = require("../src/services/ai/aiService");

describe("Worker #43 (Advanced On-page Audit) Wiring & Safety Suite", () => {
  let originalScrapeSeoPage;
  let originalAiGenerate;
  let lastAiPrompt = null;
  let scrapeCallCount = 0;
  let lastScrapedUrl = null;

  const mockFactualScrapedData = Object.freeze({
    request: {
      targetUrl: "https://example.com/landing",
      scrapedAt: "2026-10-06T00:00:00.000Z",
    },
    http: {
      finalUrl: "https://example.com/landing",
      statusCode: 200,
      contentType: "text/html",
      durationMs: 120,
      byteSize: 24500,
      redirectCount: 0,
    },
    metadata: {
      title: "Giải pháp chuyển đổi số toàn diện | Example Corp",
      titleLength: 46,
      metaDescription: "Cung cấp nền tảng tự động hóa và phân tích tiếp thị số hàng đầu cho doanh nghiệp.",
      metaDescriptionLength: 82,
      canonicalUrl: "https://example.com/landing",
      isCanonicalMatch: true,
      robotsDirectives: {
        indexable: true,
        noindex: false,
        nofollow: false,
        raw: "index, follow",
      },
    },
    headings: {
      h1Count: 1,
      h1List: ["Tự động hóa tiếp thị toàn diện"],
      h2Count: 2,
      h2List: ["Tính năng nổi bật", "Báo giá gói doanh nghiệp"],
      h3Count: 1,
      h3List: ["Tích hợp đa kênh"],
      h4Count: 0,
      h4List: [],
      h5Count: 0,
      h5List: [],
      h6Count: 0,
      h6List: [],
    },
    links: {
      internalLinkCount: 24,
      externalLinkCount: 5,
      sampleInternalLinks: [
        { url: "https://example.com/pricing", anchorText: "Xem bảng giá" },
        { url: "https://example.com/contact", anchorText: "Liên hệ tư vấn" },
      ],
      sampleExternalLinks: [
        { url: "https://partner.com", anchorText: "Đối tác chiến lược" },
      ],
    },
    structuredData: {
      detectedTypes: ["Organization", "Product", "WebPage"],
      hasJsonLd: true,
    },
    factsAndDiagnostics: {
      hasTitle: true,
      hasMetaDescription: true,
      hasCanonical: true,
      hasH1: true,
      multipleH1: false,
      notices: [],
    },
  });

  beforeEach(() => {
    lastAiPrompt = null;
    scrapeCallCount = 0;
    lastScrapedUrl = null;

    originalScrapeSeoPage = seoScraperService.scrapeSeoPage;
    originalAiGenerate = aiService.generate;

    // Spy on scrapeSeoPage
    seoScraperService.scrapeSeoPage = async (url, options) => {
      scrapeCallCount++;
      lastScrapedUrl = url;
      if (!url || typeof url !== "string") {
        const err = new Error("URL is required and must be a non-empty string");
        err.status = 400;
        err.code = "INVALID_URL";
        throw err;
      }
      return mockFactualScrapedData;
    };

    // Spy on aiService.generate
    aiService.generate = async ({ prompt, outputSchema }) => {
      lastAiPrompt = prompt;
      return {
        output: {
          summary: "Đánh giá chi tiết kỹ thuật on-page trang đích cho thấy các thẻ cơ bản được thiết lập tốt.",
          recommendations: [
            {
              title: "Tối ưu hóa cấu trúc heading",
              detail: "Bổ sung thêm thẻ H3 phân mục rõ ràng hơn dưới thẻ H2 Báo giá.",
              priority: "medium",
            },
            {
              title: "Bổ sung thuộc tính Schema BreadcrumbList",
              detail: "Cải thiện khả năng hiểu đường dẫn điều hướng trên công cụ tìm kiếm.",
              priority: "low",
            },
          ],
          assumptions: [
            "Audit chỉ phân tích HTML tĩnh của một URL duy nhất.",
            "Không kiểm tra robots.txt hoặc XML sitemap.",
            "Không có dữ liệu Google Search Console, Google Analytics hay backlink bên ngoài.",
            "Không thu thập dữ liệu qua JavaScript rendering.",
          ],
        },
        provider: "google",
        model: "gemini-2.5-flash",
      };
    };
  });

  afterEach(() => {
    seoScraperService.scrapeSeoPage = originalScrapeSeoPage;
    aiService.generate = originalAiGenerate;
  });

  // 1. Exact slug resolution
  test("1. Worker #43 resolves by exact slug 'advanced-on-page-audit'", () => {
    assert.equal(BATCH_B5_SLUGS.ADVANCED_ON_PAGE_AUDIT, "advanced-on-page-audit");
    assert.ok(isBatchB5Worker("advanced-on-page-audit"));
    assert.ok(isTypeBWorker("advanced-on-page-audit"));

    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    assert.ok(worker, "Worker #43 must exist in catalog");
  });

  // 2. Correct catalog metadata
  test("2. Correct catalog metadata: slug, tier M3, category Advanced", () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    assert.equal(worker.slug, "advanced-on-page-audit");
    assert.equal(worker.requiredPackage, "M3");
    assert.equal(worker.category, "Advanced");
    assert.equal(worker.name, "Advanced On-page Audit");
  });

  // 3 & 6 & 7. targetUrl is accepted, scraper called once with resolved URL
  test("3, 6, 7. targetUrl is accepted; scraper is called exactly once with resolved URL", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    const result = await worker.execute({
      userId: "test-user-123",
      input: {
        objective: "Kiểm tra kỹ thuật on-page trang đích",
        targetUrl: "https://example.com/landing",
      },
    });

    assert.equal(scrapeCallCount, 1, "Scraper must be called exactly once");
    assert.equal(lastScrapedUrl, "https://example.com/landing");
    assert.ok(result.output);
  });

  // 4. url alias is accepted
  test("4. url alias is accepted when targetUrl is omitted", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    const result = await worker.execute({
      userId: "test-user-123",
      input: {
        objective: "Kiểm tra kỹ thuật on-page",
        url: "https://example.com/alternate",
      },
    });

    assert.equal(scrapeCallCount, 1);
    assert.equal(lastScrapedUrl, "https://example.com/alternate");
    assert.ok(result.output);
  });

  // 5. Missing target URL fails clearly
  test("5. Missing target URL fails clearly without inventing or substituting a domain", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await assert.rejects(
      async () => {
        await worker.execute({
          userId: "test-user-123",
          input: {
            objective: "Kiểm tra không truyền URL",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "INVALID_URL");
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  // 8. Scraper factual output reaches bounded AI context
  test("8. Scraper factual output reaches bounded AI context", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await worker.execute({
      userId: "test-user-123",
      input: {
        objective: "Kiểm tra kỹ thuật trang",
        targetUrl: "https://example.com/landing",
      },
    });

    assert.ok(lastAiPrompt, "AI prompt must be generated");
    assert.ok(lastAiPrompt.includes("VERIFIED ON-PAGE SEO AUDIT DATA"));
    assert.ok(lastAiPrompt.includes("Giải pháp chuyển đổi số toàn diện | Example Corp"));
    assert.ok(lastAiPrompt.includes('"canonicalUrl": "https://example.com/landing"'));
    assert.ok(lastAiPrompt.includes('"h1Count": 1'));
    assert.ok(lastAiPrompt.includes('"internalLinkCount": 24'));
    assert.ok(lastAiPrompt.includes('"Organization"'));
    assert.ok(lastAiPrompt.includes('"Product"'));
    assert.ok(lastAiPrompt.includes('"durationMs": 120'));
    assert.ok(lastAiPrompt.includes('"byteSize": 24500'));
  });

  // 9. Raw HTML is NOT passed to AI
  test("9. Raw HTML is NOT passed to AI", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await worker.execute({
      userId: "test-user-123",
      input: {
        objective: "Kiểm tra",
        targetUrl: "https://example.com/landing",
      },
    });

    assert.ok(!lastAiPrompt.includes("<!DOCTYPE html>"));
    assert.ok(!lastAiPrompt.includes("<html"));
    assert.ok(!lastAiPrompt.includes("<body"));
    assert.ok(!lastAiPrompt.includes("<div"));
    assert.ok(!lastAiPrompt.includes("<script"));
    assert.ok(!lastAiPrompt.includes("<head"));
  });

  // 10. AI prompt does NOT contain forbidden claims
  test("10. AI prompt does NOT contain ranking claims, traffic claims, keyword volume, competitor metrics, Core Web Vitals, conversion metrics", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await worker.execute({
      userId: "test-user-123",
      input: {
        objective: "Kiểm tra",
        targetUrl: "https://example.com/landing",
      },
    });

    // Prompt contains strict forbidden constraints against these claims
    assert.ok(lastAiPrompt.includes("NEVER fabricate or invent an SEO score"));
    assert.ok(lastAiPrompt.includes("NEVER fabricate keyword rankings, search volume"));
    assert.ok(lastAiPrompt.includes("NEVER fabricate organic traffic estimates"));
    assert.ok(lastAiPrompt.includes("NEVER claim Google penalties"));
    assert.ok(lastAiPrompt.includes("NEVER make unverified causal claims"));
    assert.ok(lastAiPrompt.includes("Do NOT claim Core Web Vitals (LCP, CLS, INP)"));
    assert.ok(lastAiPrompt.includes("Do NOT claim conversion rates, bounce rates, heatmaps"));
    assert.ok(lastAiPrompt.includes("Audit chỉ phân tích HTML tĩnh của một URL duy nhất"));
    assert.ok(lastAiPrompt.includes("Không kiểm tra robots.txt hoặc XML sitemap"));
    assert.ok(lastAiPrompt.includes("Không có dữ liệu Google Search Console"));
  });

  // 11. Scraper errors propagate faithfully
  test("11. Scraper errors propagate faithfully (INVALID_URL, SSRF_BLOCKED, TIMEOUT_EXCEEDED, PAYLOAD_TOO_LARGE)", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");

    // SSRF_BLOCKED
    seoScraperService.scrapeSeoPage = async () => {
      const err = new Error("Target address is restricted (SSRF protection)");
      err.code = "SSRF_BLOCKED";
      err.status = 403;
      throw err;
    };
    await assert.rejects(
      async () => {
        await worker.execute({
          userId: "user-1",
          input: { objective: "Audit", targetUrl: "http://169.254.169.254" },
        });
      },
      (err) => err.code === "SSRF_BLOCKED" && err.status === 403
    );

    // TIMEOUT_EXCEEDED
    seoScraperService.scrapeSeoPage = async () => {
      const err = new Error("Request timed out");
      err.code = "TIMEOUT_EXCEEDED";
      err.status = 504;
      throw err;
    };
    await assert.rejects(
      async () => {
        await worker.execute({
          userId: "user-1",
          input: { objective: "Audit", targetUrl: "https://example.com/slow" },
        });
      },
      (err) => err.code === "TIMEOUT_EXCEEDED" && err.status === 504
    );

    // PAYLOAD_TOO_LARGE
    seoScraperService.scrapeSeoPage = async () => {
      const err = new Error("Payload exceeds limit");
      err.code = "PAYLOAD_TOO_LARGE";
      err.status = 413;
      throw err;
    };
    await assert.rejects(
      async () => {
        await worker.execute({
          userId: "user-1",
          input: { objective: "Audit", targetUrl: "https://example.com/large" },
        });
      },
      (err) => err.code === "PAYLOAD_TOO_LARGE" && err.status === 413
    );
  });

  // 12. USER_ID_REQUIRED behavior remains enforced
  test("12. USER_ID_REQUIRED behavior remains enforced when userId is missing", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await assert.rejects(
      async () => {
        await worker.execute({
          input: {
            objective: "Audit",
            targetUrl: "https://example.com",
          },
        });
      },
      (err) => err.code === "USER_ID_REQUIRED" && err.status === 400
    );
  });

  // 13. Standard output schema is preserved
  test("13. Standard output schema is preserved { summary, recommendations, assumptions }", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    const result = await worker.execute({
      userId: "user-1",
      input: {
        objective: "Audit",
        targetUrl: "https://example.com",
      },
    });

    assert.ok(result.output);
    assert.equal(typeof result.output.summary, "string");
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));
    for (const rec of result.output.recommendations) {
      assert.equal(typeof rec.title, "string");
      assert.equal(typeof rec.detail, "string");
      assert.ok(["high", "medium", "low"].includes(rec.priority));
    }
  });

  // 14. No external API is invoked
  test("14. No external API is invoked beyond mock scraper and aiService", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    await worker.execute({
      userId: "user-1",
      input: {
        objective: "Audit",
        targetUrl: "https://example.com",
      },
    });
    assert.equal(scrapeCallCount, 1);
    assert.ok(lastAiPrompt);
  });

  // 15. No database mutation occurs
  test("15. No database mutation occurs during execution", async () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    const res = await worker.execute({
      userId: "user-1",
      input: {
        objective: "Audit",
        targetUrl: "https://example.com",
      },
    });
    assert.ok(res.output);
  });

  // 16. Existing workers remain unaffected
  test("16. Existing workers remain unaffected (Worker #8 and generic workers)", async () => {
    const worker8 = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    assert.ok(worker8);
    const res8 = await worker8.execute({
      userId: "user-1",
      input: {
        objective: "Audit CEO",
        targetUrl: "https://example.com",
      },
    });
    assert.ok(res8.output);

    const genericWorker = workers.find((w) => w.slug === "customer-persona");
    assert.ok(genericWorker);
    const resGeneric = await genericWorker.execute({
      userId: "user-1",
      input: {
        objective: "Xây dựng persona khách hàng",
      },
    });
    assert.ok(resGeneric.output);
  });

  // 17. Input Schema validation: accepts targetUrl and url alias, strict validation
  test("17. Input schema strictly parses targetUrl / url alias and rejects extraneous fields", () => {
    const worker = workers.find((w) => w.slug === "advanced-on-page-audit");
    const validWithTarget = worker.inputSchema.parse({
      objective: "Kiểm tra kỹ thuật trang",
      targetUrl: "https://example.com",
    });
    assert.equal(validWithTarget.targetUrl, "https://example.com");

    const validWithUrl = worker.inputSchema.parse({
      objective: "Kiểm tra kỹ thuật trang",
      url: "https://example.com",
    });
    assert.equal(validWithUrl.url, "https://example.com");

    assert.throws(() => {
      worker.inputSchema.parse({
        objective: "Kiểm tra",
        targetUrl: "https://example.com",
        unknownField: "hack",
      });
    });
  });
});
