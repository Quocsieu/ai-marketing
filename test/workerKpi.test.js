"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/config/database");
const workerKpiService = require("../src/services/marketing/workerKpiService");
const {
  BATCH_B1_SLUGS,
  BATCH_B2_SLUGS,
  BATCH_B3_SLUGS,
  BATCH_B4_SLUGS,
  isBatchB1Worker,
  isBatchB2Worker,
  isBatchB3Worker,
  isBatchB4Worker,
  isTypeBWorker,
} = require("../src/workers/typeBWorkerWiring");
const workers = require("../src/workers");
const aiService = require("../src/services/ai/aiService");

describe("Worker KPI Tracking & Worker #71 Suite", () => {
  let originalFindMany;
  let originalAiGenerate;
  let lastAiPrompt = null;

  beforeEach(() => {
    originalFindMany = prisma.workerExecution.findMany;
    originalAiGenerate = aiService.generate;
    lastAiPrompt = null;
  });

  afterEach(() => {
    prisma.workerExecution.findMany = originalFindMany;
    aiService.generate = originalAiGenerate;
  });

  // TEST 1: Zero executions returns valid zero-model with null rates and empty arrays
  test("TEST 1: Zero executions returns valid zero-model with null rates and empty arrays", () => {
    const kpi = workerKpiService.calculateWorkerKpis([]);

    assert.equal(kpi.totalExecutions, 0);
    assert.equal(kpi.successfulExecutions, 0);
    assert.equal(kpi.failedExecutions, 0);
    assert.equal(kpi.pendingExecutions, 0);
    assert.equal(kpi.successRate, null);
    assert.equal(kpi.failureRate, null);
    assert.equal(kpi.durationMetrics.averageDurationMs, null);
    assert.equal(kpi.durationMetrics.minDurationMs, null);
    assert.equal(kpi.durationMetrics.maxDurationMs, null);
    assert.equal(kpi.durationMetrics.validDurationCount, 0);
    assert.deepEqual(kpi.workerBreakdown, []);
    assert.deepEqual(kpi.topWorkers, []);
    assert.deepEqual(kpi.errors, []);
    assert.ok(kpi.dataNotice.includes("No AI worker execution telemetry recorded"));
  });

  // TEST 2: All successful executions yields successRate=100% and failureRate=0%
  test("TEST 2: All successful executions yields successRate=100% and failureRate=0%", () => {
    const executions = [
      { workerSlug: "marketing-planner", status: "SUCCEEDED", durationMs: 1200 },
      { workerSlug: "marketing-planner", status: "SUCCEEDED", durationMs: 800 },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.totalExecutions, 2);
    assert.equal(kpi.successfulExecutions, 2);
    assert.equal(kpi.failedExecutions, 0);
    assert.equal(kpi.pendingExecutions, 0);
    assert.equal(kpi.successRate, 100);
    assert.equal(kpi.failureRate, 0);
    assert.equal(kpi.durationMetrics.averageDurationMs, 1000);
    assert.equal(kpi.durationMetrics.minDurationMs, 800);
    assert.equal(kpi.durationMetrics.maxDurationMs, 1200);
    assert.equal(kpi.durationMetrics.validDurationCount, 2);
  });

  // TEST 3: Mixed successful, failed, and pending executions computes exact rates
  test("TEST 3: Mixed successful, failed, and pending executions computes exact rates", () => {
    const executions = [
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 500 },
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 700 },
      { workerSlug: "w2", status: "FAILED", durationMs: 300, errorMessage: "Timeout" },
      { workerSlug: "w3", status: "PENDING", durationMs: null },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.totalExecutions, 4);
    assert.equal(kpi.successfulExecutions, 2);
    assert.equal(kpi.failedExecutions, 1);
    assert.equal(kpi.pendingExecutions, 1);
    assert.equal(kpi.successRate, 50); // 2/4 * 100
    assert.equal(kpi.failureRate, 25); // 1/4 * 100
    assert.equal(kpi.durationMetrics.validDurationCount, 3);
    assert.equal(kpi.durationMetrics.averageDurationMs, 500); // (500+700+300)/3
  });

  // TEST 4: Exclusively pending executions yields successRate=0% and failureRate=0%
  test("TEST 4: Exclusively pending executions yields successRate=0% and failureRate=0%", () => {
    const executions = [
      { workerSlug: "w1", status: "PENDING" },
      { workerSlug: "w2", status: "PENDING" },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.totalExecutions, 2);
    assert.equal(kpi.successfulExecutions, 0);
    assert.equal(kpi.failedExecutions, 0);
    assert.equal(kpi.pendingExecutions, 2);
    assert.equal(kpi.successRate, 0);
    assert.equal(kpi.failureRate, 0);
    assert.equal(kpi.durationMetrics.averageDurationMs, null);
  });

  // TEST 5 & 6: Precision rates correctly round to 2 decimal places
  test("TEST 5 & 6: Precision rates correctly round to 2 decimal places", () => {
    // 1 success out of 3 = 33.33%
    const executions = [
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 100 },
      { workerSlug: "w2", status: "FAILED", durationMs: 200 },
      { workerSlug: "w3", status: "FAILED", durationMs: 305 },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.successRate, 33.33);
    assert.equal(kpi.failureRate, 66.67);
    assert.equal(kpi.durationMetrics.averageDurationMs, 201.67); // (100+200+305)/3 = 201.6666...
  });

  // TEST 7, 8, 9: Accurately computes min, max, and average duration across numeric values
  test("TEST 7, 8, 9: Accurately computes min, max, and average duration across numeric values", () => {
    const executions = [
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 150 },
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 450 },
      { workerSlug: "w2", status: "SUCCEEDED", durationMs: 300 },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.durationMetrics.minDurationMs, 150);
    assert.equal(kpi.durationMetrics.maxDurationMs, 450);
    assert.equal(kpi.durationMetrics.averageDurationMs, 300);
  });

  // TEST 10: Null or missing durations do not count in valid duration count or average
  test("TEST 10: Null or missing durations do not count in valid duration count or average", () => {
    const executions = [
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 500 },
      { workerSlug: "w2", status: "SUCCEEDED", durationMs: null },
      { workerSlug: "w3", status: "FAILED" }, // missing durationMs
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.durationMetrics.validDurationCount, 1);
    assert.equal(kpi.durationMetrics.averageDurationMs, 500);
    assert.equal(kpi.durationMetrics.minDurationMs, 500);
    assert.equal(kpi.durationMetrics.maxDurationMs, 500);
  });

  // TEST 11: Negative, non-numeric, or infinite durations are safely ignored
  test("TEST 11: Negative, non-numeric, or infinite durations are safely ignored", () => {
    const executions = [
      { workerSlug: "w1", status: "SUCCEEDED", durationMs: 600 },
      { workerSlug: "w2", status: "SUCCEEDED", durationMs: -100 },
      { workerSlug: "w3", status: "SUCCEEDED", durationMs: Infinity },
      { workerSlug: "w4", status: "SUCCEEDED", durationMs: NaN },
      { workerSlug: "w5", status: "SUCCEEDED", durationMs: "not a number" },
    ];
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.durationMetrics.validDurationCount, 1);
    assert.equal(kpi.durationMetrics.averageDurationMs, 600);
  });

  // TEST 12: Worker breakdown sorts deterministically by totalExecutions DESC, then workerSlug ASC
  test("TEST 12: Worker breakdown sorts deterministically by totalExecutions DESC, then workerSlug ASC", () => {
    const executions = [
      { workerSlug: "b-worker", status: "SUCCEEDED", durationMs: 100 },
      { workerSlug: "a-worker", status: "SUCCEEDED", durationMs: 200 },
      { workerSlug: "c-worker", status: "SUCCEEDED", durationMs: 300 },
      { workerSlug: "c-worker", status: "FAILED", durationMs: 400 },
      { workerSlug: "b-worker", status: "SUCCEEDED", durationMs: 500 },
    ];
    // Counts:
    // b-worker: 2
    // c-worker: 2
    // a-worker: 1
    // Tie-breaker for 2 executions: "b-worker" < "c-worker"
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.workerBreakdown.length, 3);
    assert.equal(kpi.workerBreakdown[0].workerSlug, "b-worker");
    assert.equal(kpi.workerBreakdown[1].workerSlug, "c-worker");
    assert.equal(kpi.workerBreakdown[2].workerSlug, "a-worker");
  });

  // TEST 13: Error summary aggregates counts and sorts by count DESC, then message ASC
  test("TEST 13: Error summary aggregates counts and sorts by count DESC, then message ASC", () => {
    const executions = [
      { workerSlug: "w1", status: "FAILED", errorMessage: "RateLimitExceeded" },
      { workerSlug: "w2", status: "FAILED", errorMessage: "GatewayTimeout" },
      { workerSlug: "w3", status: "FAILED", errorMessage: "GatewayTimeout" },
      { workerSlug: "w1", status: "FAILED", errorMessage: "RateLimitExceeded" },
      { workerSlug: "w4", status: "FAILED", errorMessage: "AuthExpired" },
    ];
    // Counts:
    // GatewayTimeout: 2
    // RateLimitExceeded: 2
    // AuthExpired: 1
    // Tie-breaker: GatewayTimeout < RateLimitExceeded
    const kpi = workerKpiService.calculateWorkerKpis(executions);

    assert.equal(kpi.errors.length, 3);
    assert.equal(kpi.errors[0].errorMessage, "GatewayTimeout");
    assert.equal(kpi.errors[0].count, 2);
    assert.deepEqual(kpi.errors[0].impactedWorkers, ["w2", "w3"]);
    assert.equal(kpi.errors[1].errorMessage, "RateLimitExceeded");
    assert.equal(kpi.errors[1].count, 2);
    assert.deepEqual(kpi.errors[1].impactedWorkers, ["w1"]);
    assert.equal(kpi.errors[2].errorMessage, "AuthExpired");
    assert.equal(kpi.errors[2].count, 1);
  });

  // TEST 14: getWorkerKpis passes workerSlug filter to database query
  test("TEST 14: getWorkerKpis passes workerSlug filter to database query", async () => {
    let capturedWhere = null;
    prisma.workerExecution.findMany = async ({ where }) => {
      capturedWhere = where;
      return [];
    };

    await workerKpiService.getWorkerKpis("user_123", { workerSlug: "marketing-planner" });

    assert.ok(capturedWhere);
    assert.equal(capturedWhere.userId, "user_123");
    assert.equal(capturedWhere.workerSlug, "marketing-planner");
  });

  // TEST 15 & 16: Date filtering sets UTC boundaries (00:00:00 to 23:59:59.999)
  test("TEST 15 & 16: Date filtering sets UTC boundaries (00:00:00 to 23:59:59.999)", async () => {
    let capturedWhere = null;
    prisma.workerExecution.findMany = async ({ where }) => {
      capturedWhere = where;
      return [];
    };

    await workerKpiService.getWorkerKpis("user_123", {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-05",
    });

    assert.ok(capturedWhere.createdAt);
    assert.equal(capturedWhere.createdAt.gte.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(capturedWhere.createdAt.lte.toISOString(), "2026-10-05T23:59:59.999Z");

    // Rejection on inverted date range
    await assert.rejects(
      async () => {
        await workerKpiService.getWorkerKpis("user_123", {
          dateFrom: "2026-10-10",
          dateTo: "2026-10-01",
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_DATE_RANGE");
        return true;
      }
    );
  });

  // TEST 17 & 18: Strict user isolation enforces where: { userId } and prevents cross-tenant leaks
  test("TEST 17 & 18: Strict user isolation enforces where: { userId } and prevents cross-tenant leaks", async () => {
    let capturedWhere = null;
    prisma.workerExecution.findMany = async ({ where }) => {
      capturedWhere = where;
      return [];
    };

    await workerKpiService.getWorkerKpis("user_tenant_alpha");
    assert.equal(capturedWhere.userId, "user_tenant_alpha");

    // Missing userId throws 400
    await assert.rejects(
      async () => {
        await workerKpiService.getWorkerKpis(null);
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "USER_ID_REQUIRED");
        return true;
      }
    );
    await assert.rejects(
      async () => {
        await workerKpiService.getWorkerKpis("");
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "USER_ID_REQUIRED");
        return true;
      }
    );
  });

  // TEST 19: Extreme edge cases never generate NaN or Infinity values
  test("TEST 19: Extreme edge cases never generate NaN or Infinity values", () => {
    const kpi = workerKpiService.calculateWorkerKpis([
      { workerSlug: "edge", status: "UNKNOWN_STATUS", durationMs: null },
    ]);

    assert.equal(kpi.totalExecutions, 1);
    assert.equal(kpi.successfulExecutions, 0);
    assert.equal(kpi.failedExecutions, 0);
    assert.equal(kpi.pendingExecutions, 0);
    assert.equal(kpi.successRate, 0);
    assert.equal(kpi.failureRate, 0);
    assert.equal(kpi.durationMetrics.averageDurationMs, null);
    assert.equal(Number.isNaN(kpi.successRate), false);
    assert.equal(Number.isNaN(kpi.failureRate), false);
  });

  // TEST 20: Handles null, undefined, and malformed row objects gracefully without throwing
  test("TEST 20: Handles null, undefined, and malformed row objects gracefully without throwing", () => {
    const kpi = workerKpiService.calculateWorkerKpis([
      null,
      undefined,
      "a string",
      123,
      {},
      { workerSlug: "valid", status: "SUCCEEDED", durationMs: 100 },
    ]);

    // Only objects count ({} and valid row)
    assert.equal(kpi.totalExecutions, 2);
    assert.equal(kpi.successfulExecutions, 1);
    assert.equal(kpi.durationMetrics.validDurationCount, 1);
    assert.equal(kpi.durationMetrics.averageDurationMs, 100);
  });

  // TEST 21: Worker classification identifies Worker #71 as Type B (Batch B4)
  test("TEST 21: Worker classification identifies Worker #71 as Type B (Batch B4)", () => {
    assert.equal(isBatchB4Worker("ai-worker-kpi-tracking"), true);
    assert.equal(isTypeBWorker("ai-worker-kpi-tracking"), true);

    const worker71 = workers.find((w) => w.slug === "ai-worker-kpi-tracking");
    assert.ok(worker71);
    assert.equal(worker71.requiredPackage, "M4");
    assert.equal(typeof worker71.execute, "function");
  });

  // TEST 22: Worker #71 executes, loads KPI data, and injects into AI prompt
  test("TEST 22: Worker #71 executes, loads KPI data, and injects into AI prompt", async () => {
    prisma.workerExecution.findMany = async ({ where }) => {
      assert.equal(where.userId, "user_kpi_test");
      return [
        {
          id: "ex_1",
          workerSlug: "customer-persona",
          status: "SUCCEEDED",
          durationMs: 850,
          errorMessage: null,
          createdAt: new Date("2026-10-05T10:00:00Z"),
        },
        {
          id: "ex_2",
          workerSlug: "marketing-planner",
          status: "FAILED",
          durationMs: 400,
          errorMessage: "ModelContextLengthExceeded",
          createdAt: new Date("2026-10-05T11:00:00Z"),
        },
      ];
    };

    aiService.generate = async ({ prompt, outputSchema }) => {
      lastAiPrompt = prompt;
      return {
        output: {
          summary: "Đã phân tích hiệu suất thực thi của AI worker trong kỳ đánh giá.",
          recommendations: [
            {
              title: "Tối ưu hóa ngữ cảnh cho marketing-planner",
              detail: "Xử lý lỗi ModelContextLengthExceeded bằng cách rút gọn input.",
              priority: "HIGH",
            },
          ],
          assumptions: ["Dữ liệu đo lường dựa trên 2 lượt thực thi ghi nhận."],
        },
      };
    };

    const worker71 = workers.find((w) => w.slug === "ai-worker-kpi-tracking");
    assert.ok(worker71);

    const result = await worker71.execute({
      userId: "user_kpi_test",
      input: {
        objective: "Đánh giá hiệu suất vận hành hệ thống AI worker và phân tích các trường hợp lỗi",
      },
      context: { businessName: "Doanh Nghiệp Test" },
    });

    assert.ok(result.output);
    assert.ok(result.output.summary);
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    // Verify bounded prompt received ground truth KPI data
    assert.ok(lastAiPrompt.includes("totalExecutions"));
    assert.ok(lastAiPrompt.includes("successfulExecutions"));
    assert.ok(lastAiPrompt.includes("customer-persona"));
    assert.ok(lastAiPrompt.includes("marketing-planner"));
    assert.ok(lastAiPrompt.includes("ModelContextLengthExceeded"));
    assert.ok(lastAiPrompt.includes("WORKER SPECIFIC INSTRUCTIONS (AI Worker KPI Tracking)"));
    assert.ok(lastAiPrompt.includes("Do NOT invent, hallucinate, or estimate token usage"));
  });

  // TEST 23: Non-interference: Batch B1, B2, and B3 workers execute unchanged
  test("TEST 23: Non-interference: Batch B1, B2, and B3 workers remain completely unaffected", () => {
    assert.equal(isBatchB1Worker(BATCH_B1_SLUGS.ANALYTICS_CEO_DASHBOARD), true);
    assert.equal(isBatchB2Worker(BATCH_B2_SLUGS.MARKETING_ALERT), true);
    assert.equal(isBatchB3Worker(BATCH_B3_SLUGS.FUNNEL_DROP_OFF_ANALYST), true);
    assert.equal(isBatchB4Worker(BATCH_B4_SLUGS.AI_WORKER_KPI_TRACKING), true);

    assert.equal(isTypeBWorker("marketing-planner"), false); // Type A remains false
  });
});
