const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const workers = require("../src/workers");
const aiService = require("../src/services/ai/aiService");
const marketingDataService = require("../src/services/marketing/marketingDataService");
const marketingHealthService = require("../src/services/marketing/marketingHealthService");
const marketingContributionService = require("../src/services/marketing/marketingContributionService");
const kpiEvaluationService = require("../src/services/marketing/kpiEvaluationService");
const marketingAlertService = require("../src/services/marketing/marketingAlertService");
const {
  BATCH_B1_SLUGS,
  BATCH_B2_SLUGS,
  isBatchB1Worker,
  isBatchB2Worker,
  isBatchB5Worker,
  isTypeBWorker,
  loadBatchB2Data,
  executeTypeBWorker,
} = require("../src/workers/typeBWorkerWiring");

describe("Phase 2.7+ Batch B2: Type B Worker Wiring Suite", () => {
  let originalAiGenerate;
  let originalEvaluateUserKpis;
  let originalEvaluateAlerts;
  let originalGetAggregated;
  let originalGetComparison;
  let originalAnalyzeContribution;

  let lastAiCallPrompt = null;
  let lastAiCallSchema = null;

  beforeEach(() => {
    lastAiCallPrompt = null;
    lastAiCallSchema = null;

    originalAiGenerate = aiService.generate;
    originalEvaluateUserKpis = kpiEvaluationService.evaluateUserKpis;
    originalEvaluateAlerts = marketingAlertService.evaluateAlertsForKpiResult;
    originalGetAggregated = marketingDataService.getAggregatedMetrics;
    originalGetComparison = marketingDataService.getPeriodComparison;
    originalAnalyzeContribution = marketingContributionService.analyzeCampaignContribution;

    // Standard mock AI generate returning strict common contract
    aiService.generate = async ({ prompt, outputSchema }) => {
      lastAiCallPrompt = prompt;
      lastAiCallSchema = outputSchema;
      return {
        output: {
          summary: "Báo cáo phân tích hiệu suất và ngân sách dựa trên số liệu thực tế.",
          recommendations: [
            {
              title: "Tối ưu hóa phân bổ ngân sách",
              detail: "Tập trung ngân sách vào các chiến dịch vượt benchmark hiệu quả.",
              priority: "high",
            },
          ],
          assumptions: [
            "Số liệu phản ánh dữ liệu snapshot nội bộ đã được ghi nhận trong kỳ.",
            "Các khuyến nghị là tư vấn chiến lược, không tự động can thiệp tài khoản quảng cáo.",
          ],
        },
        provider: "mock-ai-provider",
        model: "mock-model",
      };
    };
  });

  afterEach(() => {
    aiService.generate = originalAiGenerate;
    kpiEvaluationService.evaluateUserKpis = originalEvaluateUserKpis;
    marketingAlertService.evaluateAlertsForKpiResult = originalEvaluateAlerts;
    marketingDataService.getAggregatedMetrics = originalGetAggregated;
    marketingDataService.getPeriodComparison = originalGetComparison;
    marketingContributionService.analyzeCampaignContribution = originalAnalyzeContribution;
  });

  // ========================================================
  // 1. Worker Classification & Registry Verification
  // ========================================================
  test("1. Worker Classification: identifies exactly 3 B1 and 3 B2 workers, exactly 6 total Type B", () => {
    assert.equal(isBatchB2Worker("marketing-alert"), true);
    assert.equal(isBatchB2Worker("smart-budget-allocation"), true);
    assert.equal(isBatchB2Worker("advanced-budget-planner"), true);

    // Non-Batch B2 workers must return false
    assert.equal(isBatchB2Worker("analytics-ceo-dashboard"), false);
    assert.equal(isBatchB2Worker("cac-roas-funnel-analytics"), false);
    assert.equal(isBatchB2Worker("monthly-ceo-strategy-report"), false);
    assert.equal(isBatchB2Worker("customer-persona"), false);
    assert.equal(isBatchB2Worker("usp-offer"), false);
    assert.equal(isBatchB2Worker("facebook-campaign"), false);

    // Total Type B detection
    assert.equal(isTypeBWorker("marketing-alert"), true);
    assert.equal(isTypeBWorker("smart-budget-allocation"), true);
    assert.equal(isTypeBWorker("advanced-budget-planner"), true);
    assert.equal(isTypeBWorker("analytics-ceo-dashboard"), true);
    assert.equal(isTypeBWorker("cac-roas-funnel-analytics"), true);
    assert.equal(isTypeBWorker("monthly-ceo-strategy-report"), true);
    assert.equal(isTypeBWorker("marketing-planner"), false);
    assert.equal(isTypeBWorker("meta-campaign-launcher"), false);
  });

  test("2. Worker Registry: 3 Batch B2 workers are present in registry with valid package and inputSchema", () => {
    const wAlert = workers.find((w) => w.slug === BATCH_B2_SLUGS.MARKETING_ALERT);
    const wSmart = workers.find((w) => w.slug === BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION);
    const wAdv = workers.find((w) => w.slug === BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER);

    assert.ok(wAlert, "marketing-alert must exist in registry");
    assert.ok(wSmart, "smart-budget-allocation must exist in registry");
    assert.ok(wAdv, "advanced-budget-planner must exist in registry");

    assert.equal(wAlert.requiredPackage, "M2");
    assert.equal(wSmart.requiredPackage, "M3");
    assert.equal(wAdv.requiredPackage, "M3");

    // Input schema validation
    const validInput = { objective: "Phân bổ ngân sách Q4", audience: "Khách lẻ", constraints: "Ngân sách tối đa 100M" };
    assert.doesNotThrow(() => wAlert.inputSchema.parse(validInput));
    assert.doesNotThrow(() => wSmart.inputSchema.parse(validInput));
    assert.doesNotThrow(() => wAdv.inputSchema.parse(validInput));
  });

  // ========================================================
  // 2. User Isolation & Validation
  // ========================================================
  test("3. User Isolation: missing or invalid userId throws 400 USER_ID_REQUIRED for all B2 workers", async () => {
    const b2Workers = [
      workers.find((w) => w.slug === BATCH_B2_SLUGS.MARKETING_ALERT),
      workers.find((w) => w.slug === BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION),
      workers.find((w) => w.slug === BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER),
    ];

    for (const worker of b2Workers) {
      await assert.rejects(
        async () => {
          await worker.execute({ context: null, input: { objective: "Kiểm tra isolation" } });
        },
        (err) => err.status === 400 && err.code === "USER_ID_REQUIRED",
        `Expected ${worker.slug} to throw USER_ID_REQUIRED without userId`,
      );

      await assert.rejects(
        async () => {
          await worker.execute({ context: { userId: null }, input: { objective: "Kiểm tra isolation" }, userId: null });
        },
        (err) => err.status === 400 && err.code === "USER_ID_REQUIRED",
        `Expected ${worker.slug} to throw USER_ID_REQUIRED when userId is null`,
      );
    }
  });

  // ========================================================
  // 3. Worker #24: Marketing Alert
  // ========================================================
  test("4. Worker #24 (marketing-alert): calls kpiEvaluationService & marketingAlertService with user scope and injects alerts into AI context", async () => {
    const userId = "user_b2_alert_test";
    let kpiUserId = null;
    let dataUserId = null;

    kpiEvaluationService.evaluateUserKpis = async (uid, options) => {
      kpiUserId = uid;
      return {
        userId: uid,
        evaluatedAt: new Date("2026-10-01T00:00:00Z"),
        results: [
          {
            targetId: "kpi_target_cpa",
            metricName: "cpa",
            direction: "LOWER_IS_BETTER",
            actual: 120000,
            target: 80000,
            previousActual: 75000,
            gap: 40000,
            achievementRate: 66.67,
            status: "UNDERPERFORMING",
            performanceTrend: "DECLINING",
            numericTrend: "INCREASING",
            period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
          },
          {
            targetId: "kpi_target_roas",
            metricName: "roas",
            direction: "HIGHER_IS_BETTER",
            actual: 4.5,
            target: 4.0,
            previousActual: 3.8,
            gap: 0.5,
            achievementRate: 112.5,
            status: "ABOVE_TARGET",
            performanceTrend: "IMPROVING",
            numericTrend: "INCREASING",
            period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
          },
        ],
        summary: {
          total: 2,
          aboveTarget: 1,
          onTrack: 0,
          underperforming: 1,
          noData: 0,
          invalidTarget: 0,
        },
      };
    };

    marketingAlertService.evaluateAlertsForKpiResult = (item, options) => {
      if (item.metricName === "cpa") {
        return [
          {
            alertType: "CRITICAL_UNDERPERFORMANCE",
            severity: "CRITICAL",
            metricName: "cpa",
            title: "CPA vượt ngưỡng mục tiêu nghiêm trọng",
            message: "CPA đạt 120,000 so với mục tiêu 80,000.",
            actual: 120000,
            target: 80000,
            previousActual: 75000,
            achievementRate: 66.67,
            performanceTrend: "DECLINING",
            period: item.period,
          },
        ];
      }
      if (item.metricName === "roas") {
        return [
          {
            alertType: "KPI_TARGET_ACHIEVED",
            severity: "INFO",
            metricName: "roas",
            title: "Đạt mục tiêu ROAS",
            message: "ROAS đạt 4.5 vượt mục tiêu 4.0.",
            actual: 4.5,
            target: 4.0,
            previousActual: 3.8,
            achievementRate: 112.5,
            performanceTrend: "IMPROVING",
            period: item.period,
          },
        ];
      }
      return [];
    };

    marketingDataService.getAggregatedMetrics = async (uid, options) => {
      dataUserId = uid;
      return {
        userId: uid,
        period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
        spend: 25000000,
        impressions: 400000,
        clicks: 12000,
        conversions: 208,
        revenue: 112500000,
        ctr: 3.0,
        cpc: 2083.33,
        cpa: 120192.31,
        roas: 4.5,
      };
    };

    const worker = workers.find((w) => w.slug === BATCH_B2_SLUGS.MARKETING_ALERT);
    const result = await worker.execute({
      userId,
      context: { businessName: "E-Commerce Shop VN" },
      input: { objective: "Phát hiện và cảnh báo các chỉ số marketing bất thường trong tháng 9" },
    });

    // Check user scoping
    assert.equal(kpiUserId, userId);
    assert.equal(dataUserId, userId);

    // Check output contract
    assert.ok(result.output.summary);
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    // Verify AI prompt receives real alert data and strict safety constraints
    assert.ok(lastAiCallPrompt.includes("REAL MARKETING PERFORMANCE DATA"));
    assert.ok(lastAiCallPrompt.includes('"alertType": "CRITICAL_UNDERPERFORMANCE"'));
    assert.ok(lastAiCallPrompt.includes('"severity": "CRITICAL"'));
    assert.ok(lastAiCallPrompt.includes('"cpa"'));
    assert.ok(lastAiCallPrompt.includes('"actual": 120000'));
    assert.ok(lastAiCallPrompt.includes('"target": 80000'));
    assert.ok(lastAiCallPrompt.includes("Do NOT hallucinate or fabricate alerts"));
  });

  test("5. Worker #24 (marketing-alert): handles empty KPI targets / zero alerts safely without crash", async () => {
    const userId = "user_b2_alert_empty";

    kpiEvaluationService.evaluateUserKpis = async (uid) => ({
      userId: uid,
      evaluatedAt: new Date(),
      results: [],
      summary: { total: 0, aboveTarget: 0, onTrack: 0, underperforming: 0, noData: 0, invalidTarget: 0 },
    });

    marketingDataService.getAggregatedMetrics = async (uid) => ({
      userId: uid,
      period: { dateFrom: null, dateTo: null },
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: null,
      ctr: null,
      cpc: null,
      cpa: null,
      roas: null,
    });

    const worker = workers.find((w) => w.slug === BATCH_B2_SLUGS.MARKETING_ALERT);
    const result = await worker.execute({
      userId,
      input: { objective: "Kiểm tra cảnh báo khi chưa có dữ liệu KPI" },
    });

    assert.ok(result.output);
    assert.ok(lastAiCallPrompt.includes('"totalAlerts": 0'));
    assert.ok(lastAiCallPrompt.includes("No KPI targets configured"));
  });

  // ========================================================
  // 4. Worker #38: Smart Budget Allocation
  // ========================================================
  test("6. Worker #38 (smart-budget-allocation): calls contribution service, injects benchmark/top/underperformers, enforces no causal claims", async () => {
    const userId = "user_b2_smart_budget";
    let contribUserId = null;
    let dataUserId = null;

    marketingContributionService.analyzeCampaignContribution = async (uid, options) => {
      contribUserId = uid;
      return {
        userId: uid,
        period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
        benchmarkMetric: "roas",
        benchmarkValue: 3.2,
        portfolio: {
          spend: 50000000,
          conversions: 800,
          revenue: 160000000,
          roas: 3.2,
          cpa: 62500,
          spendProportions: {
            topPerformerSpend: 30000000,
            underperformerSpend: 15000000,
            topPerformerSpendPercent: 60.0,
            underperformerSpendPercent: 30.0,
          },
        },
        classificationCounts: {
          topPerformer: 2,
          onTrack: 1,
          underperformer: 2,
        },
        topPerformers: [
          {
            externalId: "camp_top_1",
            spend: 20000000,
            conversions: 450,
            revenue: 90000000,
            metric: 4.5,
            relativeGap: 40.63,
            classification: "TOP_PERFORMER",
          },
        ],
        underperformers: [
          {
            externalId: "camp_under_1",
            spend: 15000000,
            conversions: 100,
            revenue: 25000000,
            metric: 1.67,
            relativeGap: -47.81,
            classification: "UNDERPERFORMER",
          },
        ],
      };
    };

    marketingDataService.getAggregatedMetrics = async (uid, options) => {
      dataUserId = uid;
      return {
        userId: uid,
        period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
        spend: 50000000,
        impressions: 1000000,
        clicks: 30000,
        conversions: 800,
        revenue: 160000000,
        cpc: 1666.67,
        cpa: 62500,
        roas: 3.2,
      };
    };

    const worker = workers.find((w) => w.slug === BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION);
    const result = await worker.execute({
      userId,
      input: { objective: "Tối ưu hóa phân bổ ngân sách dựa trên hiệu quả chiến dịch" },
    });

    assert.equal(contribUserId, userId);
    assert.equal(dataUserId, userId);

    assert.ok(result.output.summary);
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    // Verify bounded context in prompt
    assert.ok(lastAiCallPrompt.includes('"benchmarkMetric": "roas"'));
    assert.ok(lastAiCallPrompt.includes('"benchmarkValue": 3.2'));
    assert.ok(lastAiCallPrompt.includes("camp_top_1"));
    assert.ok(lastAiCallPrompt.includes('"relativeGap": 40.63'));
    assert.ok(lastAiCallPrompt.includes("camp_under_1"));
    assert.ok(lastAiCallPrompt.includes('"relativeGap": -47.81'));
    // Enforces no causal claims
    assert.ok(lastAiCallPrompt.includes("Do NOT make causal attribution claims"));
    assert.ok(lastAiCallPrompt.includes("Do NOT fabricate budget caps"));
    assert.ok(lastAiCallPrompt.includes("Do NOT claim integration with Meta Ads API, Google Ads API"));
  });

  // ========================================================
  // 5. Worker #40: Advanced Budget Planner
  // ========================================================
  test("7. Worker #40 (advanced-budget-planner): calls getAggregatedMetrics & getPeriodComparison, handles period trends", async () => {
    const userId = "user_b2_budget_planner";
    let aggUserId = null;
    let compUserId = null;
    let compOptions = null;

    marketingDataService.getAggregatedMetrics = async (uid, options) => {
      aggUserId = uid;
      return {
        userId: uid,
        period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
        spend: 40000000,
        impressions: 800000,
        clicks: 24000,
        conversions: 600,
        revenue: 160000000,
        ctr: 3.0,
        cpc: 1666.67,
        cpa: 66666.67,
        roas: 4.0,
      };
    };

    marketingDataService.getPeriodComparison = async (uid, options) => {
      compUserId = uid;
      compOptions = options;
      return {
        current: {
          period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
          spend: 40000000,
          impressions: 800000,
          clicks: 24000,
          conversions: 600,
          revenue: 160000000,
          ctr: 3.0,
          cpc: 1666.67,
          cpa: 66666.67,
          roas: 4.0,
        },
        previous: {
          period: { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
          spend: 30000000,
          impressions: 600000,
          clicks: 18000,
          conversions: 400,
          revenue: 90000000,
          ctr: 3.0,
          cpc: 1666.67,
          cpa: 75000,
          roas: 3.0,
        },
        delta: {
          spend: 10000000,
          impressions: 200000,
          clicks: 6000,
          conversions: 200,
          revenue: 70000000,
          ctr: 0.0,
          cpc: 0.0,
          cpa: -8333.33,
          roas: 1.0,
        },
        deltaPercent: {
          spend: 33.33,
          impressions: 33.33,
          clicks: 33.33,
          conversions: 50.0,
          revenue: 77.78,
          ctr: 0.0,
          cpc: 0.0,
          cpa: -11.11,
          roas: 33.33,
        },
        trends: {
          spend: "INCREASING",
          impressions: "INCREASING",
          clicks: "INCREASING",
          conversions: "INCREASING",
          revenue: "INCREASING",
          ctr: "STABLE",
          cpc: "STABLE",
          cpa: "DECREASING",
          roas: "INCREASING",
        },
      };
    };

    const worker = workers.find((w) => w.slug === BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER);
    const result = await worker.execute({
      userId,
      options: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
      input: { objective: "Lập kế hoạch ngân sách marketing chi tiết cho tháng 10" },
    });

    assert.equal(aggUserId, userId);
    assert.equal(compUserId, userId);
    assert.equal(compOptions.current.dateFrom, "2026-09-01");
    assert.equal(compOptions.current.dateTo, "2026-09-30");

    assert.ok(result.output.summary);
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    // Verify AI prompt receives period comparison and planning constraints
    assert.ok(lastAiCallPrompt.includes('"currentMetrics"'));
    assert.ok(lastAiCallPrompt.includes('"spend": 40000000'));
    assert.ok(lastAiCallPrompt.includes('"delta": 10000000'));
    assert.ok(lastAiCallPrompt.includes('"deltaPercent": 33.33'));
    assert.ok(lastAiCallPrompt.includes('"trend": "INCREASING"'));
    assert.ok(lastAiCallPrompt.includes("Do NOT invent fake historical spend"));
  });

  // ========================================================
  // 6. Complete Catalog Routing Audit: 10 Type B, 61 Non-Type B
  // ========================================================
  test("8. Complete Catalog Routing Audit: exactly 10 Type B workers (3 B1 + 3 B2 + 1 B3 + 1 B4 + 2 B5) and 61 generic workers", () => {
    assert.equal(workers.length, 71, "Catalog must have exactly 71 workers");

    const expectedB1 = ["analytics-ceo-dashboard", "cac-roas-funnel-analytics", "monthly-ceo-strategy-report"];
    const expectedB2 = ["marketing-alert", "smart-budget-allocation", "advanced-budget-planner"];
    const expectedB5 = ["seo-audit-ceo-summary", "advanced-on-page-audit"];

    const actualB1 = workers.filter((w) => isBatchB1Worker(w.slug)).map((w) => w.slug);
    const actualB2 = workers.filter((w) => isBatchB2Worker(w.slug)).map((w) => w.slug);
    const actualB5 = workers.filter((w) => isBatchB5Worker(w.slug)).map((w) => w.slug);
    const actualTypeB = workers.filter((w) => isTypeBWorker(w.slug)).map((w) => w.slug);
    const nonTypeB = workers.filter((w) => !isTypeBWorker(w.slug)).map((w) => w.slug);

    assert.equal(actualB1.length, 3, "Exactly 3 B1 workers");
    assert.deepEqual(actualB1.sort(), expectedB1.sort());

    assert.equal(actualB2.length, 3, "Exactly 3 B2 workers");
    assert.deepEqual(actualB2.sort(), expectedB2.sort());

    assert.equal(actualB5.length, 2, "Exactly 2 B5 workers");
    assert.deepEqual(actualB5.sort(), expectedB5.sort());

    assert.equal(actualTypeB.length, 10, "Exactly 10 Type B workers in total");
    assert.equal(nonTypeB.length, 61, "Exactly 61 remaining workers on standard generic path");

    // Unexpected routed must be 0 (excluding known B1, B2, B3 funnel-drop-off-analyst, B4 ai-worker-kpi-tracking, and B5 expectedB5)
    const unexpectedRouted = actualTypeB.filter((slug) => !expectedB1.includes(slug) && !expectedB2.includes(slug) && slug !== "funnel-drop-off-analyst" && slug !== "ai-worker-kpi-tracking" && !expectedB5.includes(slug));
    assert.equal(unexpectedRouted.length, 0, "Zero unexpected workers routed to Type B");
  });

  test("9. Non-Type B Workers Isolation: generic worker executes standard prompt without invoking Type B data loading", async () => {
    let typeBLoaded = false;
    kpiEvaluationService.evaluateUserKpis = async () => {
      typeBLoaded = true;
      return { results: [], summary: {} };
    };
    marketingContributionService.analyzeCampaignContribution = async () => {
      typeBLoaded = true;
      return {};
    };

    const genericWorker = workers.find((w) => w.slug === "customer-persona");
    assert.ok(genericWorker);

    const result = await genericWorker.execute({
      context: { businessName: "Brand X" },
      input: { objective: "Xác định chân dung khách hàng mục tiêu" },
    });

    assert.equal(typeBLoaded, false, "Generic worker must NOT call Type B data services");
    assert.ok(lastAiCallPrompt.includes("WORKER: Customer Persona"));
    assert.ok(lastAiCallPrompt.includes("SYSTEM: You are a careful, practical marketing advisor."));
    assert.ok(!lastAiCallPrompt.includes("REAL MARKETING PERFORMANCE DATA"));
    assert.ok(result.output);
  });
});
