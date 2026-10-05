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

describe("Worker #8 (SEO Audit & CEO Summary) Wiring & Safety Suite", () => {
  let originalScrapeSeoPage;
  let originalAiGenerate;
  let lastAiPrompt = null;
  let scrapeCallCount = 0;
  let lastScrapedUrl = null;

  const mockFactualScrapedData = Object.freeze({
    request: {
      targetUrl: "https://example.com/products",
      scrapedAt: "2026-10-06T00:00:00.000Z",
    },
    http: {
      finalUrl: "https://example.com/products",
      statusCode: 200,
      contentType: "text/html",
      durationMs: 145,
      byteSize: 18450,
      redirectCount: 0,
    },
    metadata: {
      title: "Cửa hàng sản phẩm chất lượng cao | Example",
      metaDescription: "Khám phá các sản phẩm chất lượng cao với ưu đãi tốt nhất tại Example.",
      canonical: "https://example.com/products",
      robotsDirectives: "index, follow",
    },
    headings: {
      h1Count: 1,
      h1List: ["Danh mục sản phẩm chính"],
      h2Count: 2,
      h2List: ["Sản phẩm nổi bật", "Khuyến mãi trong tuần"],
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
      internalLinkCount: 15,
      externalLinkCount: 3,
      sampleInternalLinks: [
        { href: "https://example.com/about", anchorText: "Giới thiệu" },
        { href: "https://example.com/contact", anchorText: "Liên hệ" },
      ],
      sampleExternalLinks: [
        { href: "https://facebook.com/example", anchorText: "Facebook Fanpage" },
      ],
    },
    structuredData: {
      detectedTypes: ["Organization", "Product"],
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
    originalScrapeSeoPage = seoScraperService.scrapeSeoPage;
    originalAiGenerate = aiService.generate;
    lastAiPrompt = null;
    scrapeCallCount = 0;
    lastScrapedUrl = null;

    seoScraperService.scrapeSeoPage = async (url, options) => {
      scrapeCallCount++;
      lastScrapedUrl = url;
      return JSON.parse(JSON.stringify(mockFactualScrapedData));
    };

    aiService.generate = async ({ prompt, outputSchema }) => {
      lastAiPrompt = prompt;
      return {
        output: {
          summary: "Tóm tắt kiểm tra SEO điều hành cho trang sản phẩm Example.",
          recommendations: [
            {
              title: "Tối ưu hóa hệ thống thẻ tiêu đề H2-H3",
              detail: "Bổ sung các thẻ H3 mô tả phân nhóm sản phẩm chi tiết nhằm cải thiện cấu trúc ngữ nghĩa.",
              priority: "high",
            },
            {
              title: "Mở rộng liên kết nội bộ theo ngữ cảnh",
              detail: "Tăng cường liên kết nội bộ giữa các trang bài viết hướng dẫn đến trang danh mục sản phẩm.",
              priority: "medium",
            },
          ],
          assumptions: [
            "Audit chỉ phân tích HTML tĩnh của một URL duy nhất.",
            "Không kiểm tra robots.txt hoặc XML sitemap.",
            "Không có dữ liệu Google Search Console hoặc Google Analytics.",
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

  // A. Worker #8 nhận đúng slug
  test("A. Worker #8 receives and resolves the exact catalog slug 'seo-audit-ceo-summary'", () => {
    assert.equal(BATCH_B5_SLUGS.SEO_AUDIT_CEO_SUMMARY, "seo-audit-ceo-summary");
    assert.ok(isBatchB5Worker("seo-audit-ceo-summary"));
    assert.ok(isTypeBWorker("seo-audit-ceo-summary"));

    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    assert.ok(worker, "Worker #8 must exist in catalog");
    assert.equal(worker.name, "SEO Audit & CEO Summary");
    assert.equal(worker.requiredPackage, "M1");
  });

  // B & C. Worker #8 gọi scraper đúng một lần & targetUrl được truyền đúng
  test("B & C. Worker #8 invokes scraper exactly once with the provided targetUrl from input", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_1";

    const result = await worker.execute({
      userId,
      input: {
        objective: "Kiểm tra SEO on-page trang đích chiến dịch",
        targetUrl: "https://example.com/landing",
      },
    });

    assert.equal(scrapeCallCount, 1, "Scraper must be called exactly once");
    assert.equal(lastScrapedUrl, "https://example.com/landing");
    assert.ok(result.output);
  });

  // C2. URL fallback from input.url
  test("C2. Worker #8 accepts targetUrl via input.url alias if targetUrl is omitted", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_2";

    await worker.execute({
      userId,
      input: {
        objective: "Kiểm tra SEO trang chủ",
        url: "https://example.com/homepage",
      },
    });

    assert.equal(scrapeCallCount, 1);
    assert.equal(lastScrapedUrl, "https://example.com/homepage");
  });

  // D. Scraper factual output được đưa vào bounded AI context
  test("D. Scraper factual signals are properly serialized into the bounded AI prompt context", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_3";

    await worker.execute({
      userId,
      input: {
        objective: "Đánh giá SEO tổng thể cho trang sản phẩm",
        targetUrl: "https://example.com/products",
      },
    });

    assert.ok(lastAiPrompt, "AI prompt must be generated");
    assert.ok(lastAiPrompt.includes("VERIFIED ON-PAGE SEO AUDIT DATA"));
    assert.ok(lastAiPrompt.includes("Cửa hàng sản phẩm chất lượng cao | Example"));
    assert.ok(lastAiPrompt.includes('"canonical": "https://example.com/products"'));
    assert.ok(lastAiPrompt.includes('"robotsDirectives": "index, follow"'));
    assert.ok(lastAiPrompt.includes('"h1Count": 1'));
    assert.ok(lastAiPrompt.includes('"h1List"'));
    assert.ok(lastAiPrompt.includes('"internalLinkCount": 15'));
    assert.ok(lastAiPrompt.includes('"detectedTypes"'));
    assert.ok(lastAiPrompt.includes('"Organization"'));
    assert.ok(lastAiPrompt.includes('"Product"'));
    assert.ok(lastAiPrompt.includes('"durationMs": 145'));
    assert.ok(lastAiPrompt.includes('"byteSize": 18450'));
  });

  // E. Raw HTML không đi vào AI context
  test("E. Raw HTML markup and full document body are strictly excluded from AI context", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_4";

    await worker.execute({
      userId,
      input: {
        objective: "Kiểm tra SEO on-page",
        targetUrl: "https://example.com/products",
      },
    });

    assert.ok(!lastAiPrompt.includes("<!DOCTYPE html>"));
    assert.ok(!lastAiPrompt.includes("<html"));
    assert.ok(!lastAiPrompt.includes("<body"));
    assert.ok(!lastAiPrompt.includes("<div"));
    assert.ok(!lastAiPrompt.includes("<script"));
    assert.ok(!lastAiPrompt.includes("<head"));
  });

  // F & G. Scraper error propagation & INVALID_URL không bị biến thành fake SEO result
  test("F & G. INVALID_URL error is propagated without being swallowed into fake SEO results", async () => {
    seoScraperService.scrapeSeoPage = originalScrapeSeoPage; // restore real validator

    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_5";

    await assert.rejects(
      async () => {
        await worker.execute({
          userId,
          input: {
            objective: "Kiểm tra URL không hợp lệ",
            targetUrl: "not-a-valid-url",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "INVALID_URL");
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  // H. SSRF_BLOCKED được propagate
  test("H. SSRF_BLOCKED error is propagated immediately when target points to private/loopback IP", async () => {
    seoScraperService.scrapeSeoPage = async (url) => {
      const err = new Error("Access to private/local network address is forbidden");
      err.status = 403;
      err.code = "SSRF_BLOCKED";
      throw err;
    };

    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_6";

    await assert.rejects(
      async () => {
        await worker.execute({
          userId,
          input: {
            objective: "Kiểm tra SSRF",
            targetUrl: "http://127.0.0.1/admin",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "SSRF_BLOCKED");
        assert.equal(err.status, 403);
        return true;
      },
    );
  });

  // I. TIMEOUT_EXCEEDED được propagate
  test("I. TIMEOUT_EXCEEDED error is propagated when page fetch times out", async () => {
    seoScraperService.scrapeSeoPage = async () => {
      const err = new Error("Request to target URL timed out after 10000ms");
      err.status = 504;
      err.code = "TIMEOUT_EXCEEDED";
      throw err;
    };

    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_7";

    await assert.rejects(
      async () => {
        await worker.execute({
          userId,
          input: {
            objective: "Kiểm tra timeout",
            targetUrl: "https://slow-site.example.com",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "TIMEOUT_EXCEEDED");
        assert.equal(err.status, 504);
        return true;
      },
    );
  });

  // J. PAYLOAD_TOO_LARGE được propagate
  test("J. PAYLOAD_TOO_LARGE error is propagated when target page exceeds 2MB limit", async () => {
    seoScraperService.scrapeSeoPage = async () => {
      const err = new Error("Target response exceeded maximum allowed payload size of 2097152 bytes");
      err.status = 413;
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    };

    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_8";

    await assert.rejects(
      async () => {
        await worker.execute({
          userId,
          input: {
            objective: "Kiểm tra payload limit",
            targetUrl: "https://heavy-site.example.com",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "PAYLOAD_TOO_LARGE");
        assert.equal(err.status, 413);
        return true;
      },
    );
  });

  // K & L. Output schema compliance and priority enum strictly [high, medium, low]
  test("K & L. Worker output complies strictly with common schema { summary, recommendations, assumptions } and priority enums", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_9";

    const result = await worker.execute({
      userId,
      input: {
        objective: "Kiểm tra cấu trúc output schema",
        targetUrl: "https://example.com",
      },
    });

    assert.ok(result.output, "Output must exist");
    assert.equal(typeof result.output.summary, "string");
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    for (const rec of result.output.recommendations) {
      assert.equal(typeof rec.title, "string");
      assert.equal(typeof rec.detail, "string");
      assert.ok(
        ["high", "medium", "low"].includes(rec.priority),
        `Priority must be one of high/medium/low, got: ${rec.priority}`,
      );
    }

    for (const asm of result.output.assumptions) {
      assert.equal(typeof asm, "string");
    }
  });

  // M, N, O, P. Strict prompt safety rules preventing fake scores, rankings, traffic, or causal claims
  test("M, N, O, P. AI prompt contains strict forbidden instructions against fake SEO scores, fake rankings, fake traffic, and causal claims", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");
    const userId = "user_seo_test_10";

    await worker.execute({
      userId,
      input: {
        objective: "Phân tích SEO tuân thủ an toàn",
        targetUrl: "https://example.com/audit",
      },
    });

    assert.ok(lastAiPrompt.includes("NEVER fabricate or invent an SEO score"));
    assert.ok(lastAiPrompt.includes("NEVER fabricate keyword rankings"));
    assert.ok(lastAiPrompt.includes("NEVER fabricate organic traffic estimates"));
    assert.ok(lastAiPrompt.includes("NEVER claim Google penalties"));
    assert.ok(lastAiPrompt.includes("NEVER make unverified causal claims"));
    assert.ok(lastAiPrompt.includes("Audit chỉ phân tích HTML tĩnh của một URL duy nhất"));
    assert.ok(lastAiPrompt.includes("Không kiểm tra robots.txt hoặc XML sitemap"));
    assert.ok(lastAiPrompt.includes("Không có dữ liệu Google Search Console"));
  });

  // Q. User isolation & execution context preserved
  test("Q. User isolation is enforced; throws USER_ID_REQUIRED if userId is missing", async () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");

    await assert.rejects(
      async () => {
        await worker.execute({
          userId: null,
          input: {
            objective: "Kiểm tra tenant isolation",
            targetUrl: "https://example.com",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "USER_ID_REQUIRED");
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  // Input schema strictness & backward compatibility
  test("Input Schema: parses input with targetUrl, validates strictness, and maintains backward compatibility", () => {
    const worker = workers.find((w) => w.slug === "seo-audit-ceo-summary");

    // Valid with targetUrl
    const validWithTargetUrl = worker.inputSchema.parse({
      objective: "Kiểm tra trang web công ty",
      targetUrl: "https://example.com",
    });
    assert.equal(validWithTargetUrl.targetUrl, "https://example.com");

    // Valid with url alias
    const validWithUrl = worker.inputSchema.parse({
      objective: "Kiểm tra trang web công ty",
      url: "https://example.com",
    });
    assert.equal(validWithUrl.url, "https://example.com");

    // Valid without URL (backward compatible)
    const validWithoutUrl = worker.inputSchema.parse({
      objective: "Kiểm tra trang web công ty",
    });
    assert.equal(validWithoutUrl.objective, "Kiểm tra trang web công ty");

    // Rejects unknown keys due to .strict()
    assert.throws(() => {
      worker.inputSchema.parse({
        objective: "Kiểm tra",
        invalidKey: "hack",
      });
    });
  });
});
