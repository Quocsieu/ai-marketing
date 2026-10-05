const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/config/database");
const workers = require("../src/workers");
const aiService = require("../src/services/ai/aiService");
const funnelDropOffService = require("../src/services/marketing/funnelDropOffService");
const {
  BATCH_B1_SLUGS,
  BATCH_B2_SLUGS,
  BATCH_B3_SLUGS,
  isBatchB1Worker,
  isBatchB2Worker,
  isBatchB3Worker,
  isTypeBWorker,
  executeTypeBWorker,
} = require("../src/workers/typeBWorkerWiring");

describe("Funnel Drop-off Capability & Worker #39 Suite", () => {
  let originalFindMany;
  let originalAiGenerate;
  let lastPrismaWhere = null;
  let lastAiPrompt = null;
  let lastAiSchema = null;

  beforeEach(() => {
    lastPrismaWhere = null;
    lastAiPrompt = null;
    lastAiSchema = null;

    originalFindMany = prisma.marketingMetricSnapshot.findMany;
    originalAiGenerate = aiService.generate;

    aiService.generate = async ({ prompt, outputSchema }) => {
      lastAiPrompt = prompt;
      lastAiSchema = outputSchema;
      return {
        output: {
          summary: "Báo cáo phân tích phễu chuyển đổi quảng cáo dựa trên dữ liệu thực tế.",
          recommendations: [
            {
              title: "Tối ưu hóa điểm nghẽn chuyển đổi",
              detail: "Tập trung cải thiện tỷ lệ chuyển đổi từ Clicks sang Conversions.",
              priority: "high",
            },
          ],
          assumptions: [
            "Số liệu phản ánh dữ liệu snapshot nội bộ đã được ghi nhận trong kỳ.",
            "Các giai đoạn trung gian trên website như Add to Cart hay Checkout không được đo lường trong dữ liệu snapshot hiện tại.",
          ],
        },
      };
    };
  });

  afterEach(() => {
    prisma.marketingMetricSnapshot.findMany = originalFindMany;
    aiService.generate = originalAiGenerate;
  });

  // TEST 1: Normal Funnel (Positive fixture Campaign A)
  test("TEST 1: Normal funnel calculates exact CTR, CVR, overall conversion rate, ROAS, AOV", () => {
    const fixtureCampaignA = [
      {
        id: "snap_1",
        userId: "user_test",
        channel: "meta",
        externalId: "12033000001",
        objectType: "CAMPAIGN",
        date: new Date("2026-09-01T00:00:00.000Z"),
        spend: 100000,
        impressions: 10000,
        clicks: 500,
        conversions: 25,
        revenue: 500000,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixtureCampaignA);

    assert.equal(res.summary.totalImpressions, 10000);
    assert.equal(res.summary.totalClicks, 500);
    assert.equal(res.summary.totalConversions, 25);
    assert.equal(res.summary.spend, 100000);
    assert.equal(res.summary.revenue, 500000);

    // CTR: 500 / 10000 * 100 = 5%
    assert.equal(res.transitions[0].conversionRate, 5);
    // Impressions -> Clicks drop-off: (10000 - 500) / 10000 * 100 = 95%
    assert.equal(res.transitions[0].dropOffRate, 95);
    assert.equal(res.transitions[0].lostVolume, 9500);

    // CVR: 25 / 500 * 100 = 5%
    assert.equal(res.transitions[1].conversionRate, 5);
    // Clicks -> Conversions drop-off: (500 - 25) / 500 * 100 = 95%
    assert.equal(res.transitions[1].dropOffRate, 95);
    assert.equal(res.transitions[1].lostVolume, 475);

    // Overall: 25 / 10000 * 100 = 0.25%
    assert.equal(res.summary.overallConversionRate, 0.25);
    // ROAS: 500000 / 100000 = 5
    assert.equal(res.summary.roas, 5);
    // AOV: 500000 / 25 = 20000
    assert.equal(res.summary.aov, 20000);
    // RPC: 500000 / 500 = 1000
    assert.equal(res.summary.rpc, 1000);
    // CPA: 100000 / 25 = 4000
    assert.equal(res.summary.cpa, 4000);
    // CPC: 100000 / 500 = 200
    assert.equal(res.summary.cpc, 200);
  });

  // TEST 2: Zero Impressions
  test("TEST 2: Zero impressions yields null rates without NaN or Infinity", () => {
    const fixture = [
      {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spend: 0,
        revenue: null,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.summary.totalImpressions, 0);
    assert.equal(res.summary.totalClicks, 0);
    assert.equal(res.summary.totalConversions, 0);
    assert.equal(res.summary.overallConversionRate, null);
    assert.equal(res.transitions[0].conversionRate, null);
    assert.equal(res.transitions[0].dropOffRate, null);
    assert.equal(res.transitions[0].lostVolume, null);
    assert.equal(res.bottleneck, null);
  });

  // TEST 3: Zero Clicks
  test("TEST 3: Zero clicks yields CTR=0%, dropOff=100%, and CVR=null", () => {
    const fixture = [
      {
        impressions: 10000,
        clicks: 0,
        conversions: 0,
        spend: 50000,
        revenue: null,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.transitions[0].conversionRate, 0);
    assert.equal(res.transitions[0].dropOffRate, 100);
    assert.equal(res.transitions[0].lostVolume, 10000);

    assert.equal(res.transitions[1].conversionRate, null);
    assert.equal(res.transitions[1].dropOffRate, null);
    assert.equal(res.transitions[1].lostVolume, null);
  });

  // TEST 4: Zero Conversions
  test("TEST 4: Zero conversions yields CVR=0% and dropOff=100%", () => {
    const fixture = [
      {
        impressions: 5000,
        clicks: 200,
        conversions: 0,
        spend: 40000,
        revenue: null,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.transitions[1].conversionRate, 0);
    assert.equal(res.transitions[1].dropOffRate, 100);
    assert.equal(res.transitions[1].lostVolume, 200);
    assert.equal(res.summary.aov, null);
    assert.equal(res.summary.cpa, null);
  });

  // TEST 5: Null Revenue
  test("TEST 5: Null revenue does not coerce to 0, returns null AOV, RPC, and ROAS", () => {
    const fixture = [
      {
        impressions: 5000,
        clicks: 100,
        conversions: 10,
        spend: 20000,
        revenue: null,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.summary.revenue, null);
    assert.equal(res.summary.roas, null);
    assert.equal(res.summary.aov, null);
    assert.equal(res.summary.rpc, null);
  });

  // TEST 6: Partial Data
  test("TEST 6: Partial data handles missing or partial rows gracefully", () => {
    const fixture = [
      { impressions: 1000, clicks: 50 },
      null,
      { conversions: 5, spend: 10000 },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.summary.totalImpressions, 1000);
    assert.equal(res.summary.totalClicks, 50);
    assert.equal(res.summary.totalConversions, 5);
    assert.equal(res.summary.spend, 10000);
    assert.equal(res.summary.recordCount, 3);
  });

  // TEST 7: Multiple Campaigns & Deterministic Breakdown
  test("TEST 7: Multiple campaigns computes portfolio totals and deterministic campaign breakdown", () => {
    const fixture = [
      // Campaign A: CTR=5%, CVR=5%, spend=100000, revenue=500000
      {
        externalId: "camp_A",
        impressions: 10000,
        clicks: 500,
        conversions: 25,
        spend: 100000,
        revenue: 500000,
      },
      // Campaign B: CTR=2%, CVR=2%, spend=50000, revenue=20000
      {
        externalId: "camp_B",
        impressions: 5000,
        clicks: 100,
        conversions: 2,
        spend: 50000,
        revenue: 20000,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.equal(res.summary.totalImpressions, 15000);
    assert.equal(res.summary.totalClicks, 600);
    assert.equal(res.summary.totalConversions, 27);
    assert.equal(res.summary.spend, 150000);
    assert.equal(res.summary.revenue, 520000);

    assert.ok(Array.isArray(res.campaignBreakdown));
    assert.equal(res.campaignBreakdown.length, 2);

    // Ranked by lower CVR first: camp_B (CVR=2%) appears before camp_A (CVR=5%)
    assert.equal(res.campaignBreakdown[0].externalId, "camp_B");
    assert.equal(res.campaignBreakdown[0].cvr, 2);
    assert.equal(res.campaignBreakdown[0].roas, 0.4);

    assert.equal(res.campaignBreakdown[1].externalId, "camp_A");
    assert.equal(res.campaignBreakdown[1].cvr, 5);
    assert.equal(res.campaignBreakdown[1].roas, 5);
  });

  // TEST 8: Date Filtering in analyzeFunnelDropOff
  test("TEST 8: Date filtering passes UTC date range to Prisma query", async () => {
    prisma.marketingMetricSnapshot.findMany = async ({ where }) => {
      lastPrismaWhere = where;
      return [];
    };

    await funnelDropOffService.analyzeFunnelDropOff("user_123", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });

    assert.equal(lastPrismaWhere.userId, "user_123");
    assert.equal(lastPrismaWhere.objectType, "CAMPAIGN");
    assert.ok(lastPrismaWhere.date.gte instanceof Date);
    assert.ok(lastPrismaWhere.date.lte instanceof Date);
    assert.equal(lastPrismaWhere.date.gte.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(lastPrismaWhere.date.lte.toISOString(), "2026-09-30T23:59:59.999Z");
  });

  // TEST 9: Date Range Validation Errors
  test("TEST 9: Date range validation rejects invalid dates or since > until", async () => {
    await assert.rejects(
      () => funnelDropOffService.analyzeFunnelDropOff("user_123", { dateFrom: "not-a-date" }),
      { code: "INVALID_DATE_FORMAT" }
    );

    await assert.rejects(
      () => funnelDropOffService.analyzeFunnelDropOff("user_123", { dateFrom: "2026-10-10", dateTo: "2026-10-01" }),
      { code: "INVALID_DATE_RANGE" }
    );
  });

  // TEST 10: Mixed Object Levels Isolation
  test("TEST 10: analyzeFunnelDropOff strictly defaults to objectType='CAMPAIGN' to prevent double counting", async () => {
    prisma.marketingMetricSnapshot.findMany = async ({ where }) => {
      lastPrismaWhere = where;
      return [];
    };

    await funnelDropOffService.analyzeFunnelDropOff("user_123");
    assert.equal(lastPrismaWhere.objectType, "CAMPAIGN");
  });

  // TEST 11: User Isolation
  test("TEST 11: Missing userId throws 400 USER_ID_REQUIRED and queries enforce user scope", async () => {
    await assert.rejects(
      () => funnelDropOffService.analyzeFunnelDropOff(null),
      { code: "USER_ID_REQUIRED" }
    );

    await assert.rejects(
      () => funnelDropOffService.analyzeFunnelDropOff(""),
      { code: "USER_ID_REQUIRED" }
    );

    prisma.marketingMetricSnapshot.findMany = async ({ where }) => {
      lastPrismaWhere = where;
      return [];
    };

    await funnelDropOffService.analyzeFunnelDropOff("isolated_user_999");
    assert.equal(lastPrismaWhere.userId, "isolated_user_999");
  });

  // TEST 12: Unsupported Channel Returns Empty Safe Result
  test("TEST 12: Unsupported channel returns empty safe result without fabricating data", async () => {
    prisma.marketingMetricSnapshot.findMany = async ({ where }) => {
      lastPrismaWhere = where;
      return [];
    };

    const res = await funnelDropOffService.analyzeFunnelDropOff("user_123", { channel: "google" });

    assert.equal(lastPrismaWhere.channel, "google");
    assert.equal(res.summary.recordCount, 0);
    assert.equal(res.summary.totalImpressions, 0);
    assert.equal(res.summary.totalClicks, 0);
    assert.equal(res.summary.totalConversions, 0);
    assert.equal(res.bottleneck, null);
  });

  // TEST 13: Empty Dataset
  test("TEST 13: Empty dataset returns valid structure with empty stages and zero counts", () => {
    const res = funnelDropOffService.calculateFunnel([]);

    assert.equal(res.summary.recordCount, 0);
    assert.equal(res.summary.totalImpressions, 0);
    assert.equal(res.summary.totalClicks, 0);
    assert.equal(res.summary.totalConversions, 0);
    assert.equal(res.summary.spend, 0);
    assert.equal(res.summary.revenue, null);
    assert.equal(res.stages.length, 3);
    assert.equal(res.bottleneck, null);
    assert.ok(Array.isArray(res.dataLimitations));
  });

  // TEST 14: Conversions > Clicks Anomaly (View-through attribution)
  test("TEST 14: Conversions > Clicks clamps dropOffRate to 0% and logs VIEW_THROUGH_DISCREPANCY anomaly", () => {
    const fixture = [
      {
        impressions: 1000,
        clicks: 10,
        conversions: 15, // e.g. View-through conversions
        spend: 5000,
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    // Clicks -> Conversions: conversionRate = 150%, dropOffRate must NOT be negative
    assert.equal(res.transitions[1].conversionRate, 150);
    assert.equal(res.transitions[1].dropOffRate, 0);
    assert.equal(res.transitions[1].lostVolume, 0);

    assert.equal(res.anomalies.length, 1);
    assert.equal(res.anomalies[0].type, "VIEW_THROUGH_DISCREPANCY");
  });

  // TEST 15: No NaN or Infinity in math helpers
  test("TEST 15: No NaN or Infinity generated under extreme inputs", () => {
    assert.equal(funnelDropOffService.safeDivide(0, 0), null);
    assert.equal(funnelDropOffService.safeDivide(100, 0), null);
    assert.equal(funnelDropOffService.safeDivide(NaN, 10), null);
    assert.equal(funnelDropOffService.safeDivide(Infinity, 10), null);

    const transition = funnelDropOffService.computeTransition("A", "B", 0, 100, "TEST");
    assert.equal(transition.conversionRate, null);
    assert.equal(transition.dropOffRate, null);
    assert.equal(transition.lostVolume, null);
  });

  // TEST 16: Deterministic Bottleneck Identification
  test("TEST 16: Identifies the largest observed drop-off stage deterministically", () => {
    const fixture = [
      {
        impressions: 10000,
        clicks: 500, // Drop-off = 95%
        conversions: 10, // Drop-off = 98%
      },
    ];

    const res = funnelDropOffService.calculateFunnel(fixture);

    assert.ok(res.bottleneck);
    assert.equal(res.bottleneck.stage, "Clicks -> Conversions");
    assert.equal(res.bottleneck.observedDropOffRate, 98);
    assert.equal(res.bottleneck.severity, "HIGH");
  });

  // TEST 17: No Unsupported Stages in Funnel Definition
  test("TEST 17: Stages array contains strictly Impressions, Clicks, and Conversions", () => {
    const res = funnelDropOffService.calculateFunnel([
      { impressions: 100, clicks: 10, conversions: 1 },
    ]);

    const stageNames = res.stages.map((s) => s.name);
    assert.deepEqual(stageNames, ["Impressions", "Clicks", "Conversions"]);

    assert.ok(!stageNames.includes("Landing Page Views"));
    assert.ok(!stageNames.includes("Add To Cart"));
    assert.ok(!stageNames.includes("Initiated Checkout"));
  });

  // TEST 18: Revenue and ROAS Safety
  test("TEST 18: Revenue, AOV, RPC, ROAS are only calculated when valid", () => {
    // Zero spend with revenue
    const resZeroSpend = funnelDropOffService.calculateFunnel([
      { impressions: 100, clicks: 10, conversions: 2, spend: 0, revenue: 5000 },
    ]);
    assert.equal(resZeroSpend.summary.roas, null); // Spend is 0 -> no ROAS
    assert.equal(resZeroSpend.summary.aov, 2500);

    // Spend with zero revenue
    const resZeroRev = funnelDropOffService.calculateFunnel([
      { impressions: 100, clicks: 10, conversions: 2, spend: 1000, revenue: null },
    ]);
    assert.equal(resZeroRev.summary.roas, null);
    assert.equal(resZeroRev.summary.aov, null);
  });

  // TEST 19: Worker Classification for Worker #39
  test("TEST 19: Worker classification identifies Worker #39 as Type B (Batch B3)", () => {
    assert.equal(isBatchB1Worker("funnel-drop-off-analyst"), false);
    assert.equal(isBatchB2Worker("funnel-drop-off-analyst"), false);
    assert.equal(isBatchB3Worker("funnel-drop-off-analyst"), true);
    assert.equal(isTypeBWorker("funnel-drop-off-analyst"), true);

    const worker39 = workers.find((w) => w.slug === "funnel-drop-off-analyst");
    assert.ok(worker39, "Worker #39 must exist in catalog");
    assert.equal(worker39.requiredPackage, "M3");
  });

  // TEST 20: Worker #39 Execution with Real Funnel Data Injection
  test("TEST 20: Worker #39 executes, loads funnel data, and injects into AI prompt", async () => {
    const worker39 = workers.find((w) => w.slug === "funnel-drop-off-analyst");

    prisma.marketingMetricSnapshot.findMany = async () => [
      {
        id: "snap_mock",
        userId: "user_test_39",
        channel: "meta",
        externalId: "12033000001",
        objectType: "CAMPAIGN",
        date: new Date("2026-09-15"),
        impressions: 20000,
        clicks: 800,
        conversions: 40,
        spend: 160000,
        revenue: 800000,
      },
    ];

    const result = await worker39.execute({
      userId: "user_test_39",
      input: {
        objective: "Phân tích điểm rơi phễu chuyển đổi cho chiến dịch ra mắt sản phẩm mới",
      },
      context: { businessName: "Công ty Test Marketing" },
    });

    assert.ok(result.output);
    assert.ok(result.output.summary);
    assert.ok(Array.isArray(result.output.recommendations));
    assert.ok(Array.isArray(result.output.assumptions));

    // Verify bounded prompt received ground truth funnel data
    assert.ok(lastAiPrompt.includes("Impressions"));
    assert.ok(lastAiPrompt.includes("Clicks"));
    assert.ok(lastAiPrompt.includes("Conversions"));
    assert.ok(lastAiPrompt.includes("20000")); // impressions
    assert.ok(lastAiPrompt.includes("800")); // clicks
    assert.ok(lastAiPrompt.includes("40")); // conversions
    assert.ok(lastAiPrompt.includes("WORKER SPECIFIC INSTRUCTIONS (Funnel Drop-off Analyst)"));
    assert.ok(lastAiPrompt.includes("Do NOT invent or assume intermediate on-site funnel stages"));
  });

  // TEST 21: Non-interference: Batch B1 and B2 workers remain completely unaffected
  test("TEST 21: Non-interference: Batch B1 and Batch B2 workers execute unchanged", () => {
    assert.equal(isBatchB1Worker(BATCH_B1_SLUGS.ANALYTICS_CEO_DASHBOARD), true);
    assert.equal(isBatchB1Worker(BATCH_B1_SLUGS.CAC_ROAS_FUNNEL_ANALYTICS), true);
    assert.equal(isBatchB1Worker(BATCH_B1_SLUGS.MONTHLY_CEO_STRATEGY_REPORT), true);

    assert.equal(isBatchB2Worker(BATCH_B2_SLUGS.MARKETING_ALERT), true);
    assert.equal(isBatchB2Worker(BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION), true);
    assert.equal(isBatchB2Worker(BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER), true);

    assert.equal(isTypeBWorker("marketing-planner"), false); // Type A remains false
    assert.equal(isTypeBWorker("full-ads-copilot"), false); // Type C remains false
  });
});
