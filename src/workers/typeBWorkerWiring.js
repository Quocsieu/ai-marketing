const marketingDataService = require("../services/marketing/marketingDataService");
const marketingHealthService = require("../services/marketing/marketingHealthService");
const marketingContributionService = require("../services/marketing/marketingContributionService");
const kpiEvaluationService = require("../services/marketing/kpiEvaluationService");
const marketingAlertService = require("../services/marketing/marketingAlertService");
const funnelDropOffService = require("../services/marketing/funnelDropOffService");
const aiService = require("../services/ai/aiService");

const BATCH_B1_SLUGS = Object.freeze({
  ANALYTICS_CEO_DASHBOARD: "analytics-ceo-dashboard",
  CAC_ROAS_FUNNEL_ANALYTICS: "cac-roas-funnel-analytics",
  MONTHLY_CEO_STRATEGY_REPORT: "monthly-ceo-strategy-report",
});

const BATCH_B2_SLUGS = Object.freeze({
  MARKETING_ALERT: "marketing-alert",
  SMART_BUDGET_ALLOCATION: "smart-budget-allocation",
  ADVANCED_BUDGET_PLANNER: "advanced-budget-planner",
});

const BATCH_B3_SLUGS = Object.freeze({
  FUNNEL_DROP_OFF_ANALYST: "funnel-drop-off-analyst",
});

function isBatchB1Worker(slug) {
  return Object.values(BATCH_B1_SLUGS).includes(slug);
}

function isBatchB2Worker(slug) {
  return Object.values(BATCH_B2_SLUGS).includes(slug);
}

function isBatchB3Worker(slug) {
  return Object.values(BATCH_B3_SLUGS).includes(slug);
}

function isTypeBWorker(slug) {
  return isBatchB1Worker(slug) || isBatchB2Worker(slug) || isBatchB3Worker(slug);
}

function formatUtcDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveMonthlyPeriod(options = {}) {
  if (options.current && (options.current.dateFrom || options.current.since)) {
    return {
      dateFrom: formatUtcDate(options.current.dateFrom || options.current.since),
      dateTo: formatUtcDate(options.current.dateTo || options.current.until || new Date()),
    };
  }
  if (options.dateFrom || options.since) {
    return {
      dateFrom: formatUtcDate(options.dateFrom || options.since),
      dateTo: formatUtcDate(options.dateTo || options.until || new Date()),
    };
  }
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    dateFrom: formatUtcDate(thirtyDaysAgo),
    dateTo: formatUtcDate(now),
  };
}

function formatAlertItem(a) {
  if (!a) return null;
  return {
    alertType: a.alertType,
    severity: a.severity,
    metricName: a.metricName,
    title: a.title,
    message: a.message,
    actual: a.actual,
    target: a.target,
    previousActual: a.previousActual,
    achievementRate: a.achievementRate,
    performanceTrend: a.performanceTrend,
    period: a.period,
  };
}

/**
 * Loads user-scoped real marketing data and builds a bounded context for Batch B1 workers.
 */
async function loadBatchB1Data(slug, userId, options = {}) {
  switch (slug) {
    case BATCH_B1_SLUGS.ANALYTICS_CEO_DASHBOARD: {
      const health = await marketingHealthService.evaluateMarketingHealth(userId, options);
      return {
        period: health.period,
        healthScore: health.healthScore,
        healthGrade: health.healthGrade,
        portfolioMomentum: health.portfolioMomentum,
        portfolioMetrics: {
          spend: health.portfolioMetrics.spend,
          impressions: health.portfolioMetrics.impressions,
          clicks: health.portfolioMetrics.clicks,
          conversions: health.portfolioMetrics.conversions,
          revenue: health.portfolioMetrics.revenue,
          ctrPercent: health.portfolioMetrics.ctr,
          cpc: health.portfolioMetrics.cpc,
          cpa: health.portfolioMetrics.cpa,
          roas: health.portfolioMetrics.roas,
        },
        kpiCompliance: {
          totalTargets: health.kpiCompliance.totalTargets,
          complianceRate: health.kpiCompliance.complianceRate,
          onTrackCount: health.kpiCompliance.onTrackCount,
          underperformingCount: health.kpiCompliance.underperformingCount,
          noDataCount: health.kpiCompliance.noDataCount,
        },
        alertRollup: {
          totalAlerts: health.alertRollup.totalAlerts,
          criticalCount: health.alertRollup.criticalCount,
          warningCount: health.alertRollup.warningCount,
          infoCount: health.alertRollup.infoCount,
          topCriticalIssues: health.alertRollup.topCriticalIssues,
        },
        executiveSummaryText: health.executiveSummaryText,
      };
    }

    case BATCH_B1_SLUGS.CAC_ROAS_FUNNEL_ANALYTICS: {
      const aggregated = await marketingDataService.getAggregatedMetrics(userId, options);
      let contributions = null;
      try {
        contributions = await marketingContributionService.analyzeCampaignContribution(userId, options);
      } catch (_) {
        contributions = null;
      }

      return {
        period: aggregated.period,
        funnelMetrics: {
          spend: aggregated.spend,
          stage1_impressions: aggregated.impressions,
          stage2_clicks: aggregated.clicks,
          stage3_conversions: aggregated.conversions,
          stage4_purchase_revenue: aggregated.revenue,
          ctr_percent: aggregated.ctr,
          cpc: aggregated.cpc,
          cpa_cac_equivalent: aggregated.cpa,
          roas: aggregated.roas,
        },
        campaignContributions: contributions
          ? {
              benchmarkMetric: contributions.benchmarkMetric,
              benchmarkValue: contributions.benchmarkValue,
              topPerformers: (contributions.topPerformers || []).map((c) => ({
                externalId: c.externalId,
                spend: c.spend,
                metric: c.metric,
                relativeGap: c.relativeGap,
              })),
              underperformers: (contributions.underperformers || []).map((c) => ({
                externalId: c.externalId,
                spend: c.spend,
                metric: c.metric,
                relativeGap: c.relativeGap,
              })),
              classificationCounts: contributions.classificationCounts,
            }
          : null,
        funnelScopeNotice:
          "Tracked funnel stages in the data layer are strictly: Spend -> Impressions -> Clicks -> Conversions -> Purchase Value (Revenue). Intermediate e-commerce funnel events (landing page views, add to cart, initiate checkout) are NOT tracked in current snapshots and must NOT be fabricated.",
      };
    }

    case BATCH_B1_SLUGS.MONTHLY_CEO_STRATEGY_REPORT: {
      const currentPeriod = resolveMonthlyPeriod(options);
      const [health, comparison] = await Promise.all([
        marketingHealthService.evaluateMarketingHealth(userId, {
          ...options,
          dateFrom: currentPeriod.dateFrom,
          dateTo: currentPeriod.dateTo,
        }),
        marketingDataService.getPeriodComparison(userId, {
          ...options,
          current: currentPeriod,
        }),
      ]);

      return {
        currentPeriod: comparison.current.period,
        previousPeriod: comparison.previous.period,
        performanceComparison: {
          spend: {
            current: comparison.current.spend,
            previous: comparison.previous.spend,
            delta: comparison.delta.spend,
            deltaPercent: comparison.deltaPercent.spend,
            trend: comparison.trends.spend,
          },
          impressions: {
            current: comparison.current.impressions,
            previous: comparison.previous.impressions,
            delta: comparison.delta.impressions,
            deltaPercent: comparison.deltaPercent.impressions,
            trend: comparison.trends.impressions,
          },
          clicks: {
            current: comparison.current.clicks,
            previous: comparison.previous.clicks,
            delta: comparison.delta.clicks,
            deltaPercent: comparison.deltaPercent.clicks,
            trend: comparison.trends.clicks,
          },
          conversions: {
            current: comparison.current.conversions,
            previous: comparison.previous.conversions,
            delta: comparison.delta.conversions,
            deltaPercent: comparison.deltaPercent.conversions,
            trend: comparison.trends.conversions,
          },
          revenue: {
            current: comparison.current.revenue,
            previous: comparison.previous.revenue,
            delta: comparison.delta.revenue,
            deltaPercent: comparison.deltaPercent.revenue,
            trend: comparison.trends.revenue,
          },
          ctr: {
            current: comparison.current.ctr,
            previous: comparison.previous.ctr,
            delta: comparison.delta.ctr,
            deltaPercent: comparison.deltaPercent.ctr,
            trend: comparison.trends.ctr,
          },
          cpc: {
            current: comparison.current.cpc,
            previous: comparison.previous.cpc,
            delta: comparison.delta.cpc,
            deltaPercent: comparison.deltaPercent.cpc,
            trend: comparison.trends.cpc,
          },
          cpa: {
            current: comparison.current.cpa,
            previous: comparison.previous.cpa,
            delta: comparison.delta.cpa,
            deltaPercent: comparison.deltaPercent.cpa,
            trend: comparison.trends.cpa,
          },
          roas: {
            current: comparison.current.roas,
            previous: comparison.previous.roas,
            delta: comparison.delta.roas,
            deltaPercent: comparison.deltaPercent.roas,
            trend: comparison.trends.roas,
          },
        },
        healthRollup: {
          healthScore: health.healthScore,
          healthGrade: health.healthGrade,
          portfolioMomentum: health.portfolioMomentum,
          kpiCompliance: health.kpiCompliance,
          alertRollup: {
            totalAlerts: health.alertRollup.totalAlerts,
            criticalCount: health.alertRollup.criticalCount,
            warningCount: health.alertRollup.warningCount,
            topCriticalIssues: health.alertRollup.topCriticalIssues,
          },
          executiveSummaryText: health.executiveSummaryText,
        },
      };
    }

    default:
      throw Object.assign(new Error(`Worker ${slug} is not a Batch B1 Type B worker`), {
        status: 400,
        code: "INVALID_BATCH_B1_WORKER",
      });
  }
}

/**
 * Loads user-scoped real marketing data and builds a bounded context for Batch B2 workers.
 */
async function loadBatchB2Data(slug, userId, options = {}) {
  switch (slug) {
    case BATCH_B2_SLUGS.MARKETING_ALERT: {
      const [batchKpi, aggregated] = await Promise.all([
        kpiEvaluationService.evaluateUserKpis(userId, options),
        marketingDataService.getAggregatedMetrics(userId, options),
      ]);

      const kpiResults = Array.isArray(batchKpi.results) ? batchKpi.results : (batchKpi.evaluations || []);
      const allAlerts = [];
      const evaluations = [];

      for (const item of kpiResults) {
        const alerts = marketingAlertService.evaluateAlertsForKpiResult(item, options);
        evaluations.push({
          targetId: item.targetId,
          metricName: item.metricName,
          actual: item.actual,
          target: item.target,
          achievementRate: item.achievementRate,
          status: item.status,
          performanceTrend: item.performanceTrend,
          alertCount: alerts.length,
        });
        allAlerts.push(...alerts);
      }

      const summary = {
        totalAlerts: allAlerts.length,
        critical: allAlerts.filter((a) => a.severity === "CRITICAL").length,
        warning: allAlerts.filter((a) => a.severity === "WARNING").length,
        info: allAlerts.filter((a) => a.severity === "INFO").length,
      };

      const alertsBySeverity = {
        critical: allAlerts.filter((a) => a.severity === "CRITICAL").map(formatAlertItem),
        warning: allAlerts.filter((a) => a.severity === "WARNING").map(formatAlertItem),
        info: allAlerts.filter((a) => a.severity === "INFO").map(formatAlertItem),
      };

      return {
        period: aggregated.period,
        portfolioOverview: {
          spend: aggregated.spend,
          impressions: aggregated.impressions,
          clicks: aggregated.clicks,
          conversions: aggregated.conversions,
          revenue: aggregated.revenue,
          cpa: aggregated.cpa,
          roas: aggregated.roas,
        },
        alertSummary: summary,
        alertsBySeverity,
        activeAlerts: allAlerts.map(formatAlertItem),
        kpiComplianceSummary: batchKpi.summary || {
          total: 0,
          aboveTarget: 0,
          onTrack: 0,
          underperforming: 0,
          noData: 0,
          invalidTarget: 0,
        },
        kpiEvaluations: evaluations,
        alertDataNotice:
          allAlerts.length === 0
            ? kpiResults.length === 0
              ? "No KPI targets configured for this user. Therefore, no threshold-based marketing alerts were triggered."
              : "All evaluated KPI targets are currently within normal thresholds; zero alerts triggered."
            : undefined,
      };
    }

    case BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION: {
      const [contributions, aggregated] = await Promise.all([
        marketingContributionService.analyzeCampaignContribution(userId, options),
        marketingDataService.getAggregatedMetrics(userId, options),
      ]);

      return {
        period: aggregated.period,
        portfolioTotals: {
          spend: aggregated.spend,
          impressions: aggregated.impressions,
          clicks: aggregated.clicks,
          conversions: aggregated.conversions,
          revenue: aggregated.revenue,
          cpc: aggregated.cpc,
          cpa: aggregated.cpa,
          roas: aggregated.roas,
        },
        benchmarkMetric: contributions.benchmarkMetric,
        benchmarkValue: contributions.benchmarkValue,
        benchmark: {
          metric: contributions.benchmarkMetric,
          value: contributions.benchmarkValue,
        },
        classificationCounts: contributions.classificationCounts,
        topPerformers: (contributions.topPerformers || []).map((c) => ({
          externalId: c.externalId,
          spend: c.spend,
          conversions: c.conversions,
          revenue: c.revenue,
          metric: c.metric,
          relativeGap: c.relativeGap,
          classification: c.classification,
        })),
        underperformers: (contributions.underperformers || []).map((c) => ({
          externalId: c.externalId,
          spend: c.spend,
          conversions: c.conversions,
          revenue: c.revenue,
          metric: c.metric,
          relativeGap: c.relativeGap,
          classification: c.classification,
        })),
        spendProportions: contributions.portfolio?.spendProportions || null,
        scopeNotice:
          "Smart budget allocation recommendations are strategic planning guidance only. No external Ads APIs are connected, and no live budget changes are executed.",
      };
    }

    case BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER: {
      const currentPeriod = resolveMonthlyPeriod(options);
      const [aggregated, comparison] = await Promise.all([
        marketingDataService.getAggregatedMetrics(userId, {
          ...options,
          dateFrom: currentPeriod.dateFrom,
          dateTo: currentPeriod.dateTo,
        }),
        marketingDataService.getPeriodComparison(userId, {
          ...options,
          current: currentPeriod,
        }),
      ]);

      return {
        currentPeriod: comparison.current?.period || null,
        previousPeriod: comparison.previous?.period || null,
        currentMetrics: {
          spend: aggregated.spend,
          impressions: aggregated.impressions,
          clicks: aggregated.clicks,
          conversions: aggregated.conversions,
          revenue: aggregated.revenue,
          ctr: aggregated.ctr,
          cpc: aggregated.cpc,
          cpa: aggregated.cpa,
          roas: aggregated.roas,
        },
        periodComparison: {
          spend: comparison.delta?.spend !== undefined ? {
            current: comparison.current.spend,
            previous: comparison.previous.spend,
            delta: comparison.delta.spend,
            deltaPercent: comparison.deltaPercent.spend,
            trend: comparison.trends.spend,
          } : null,
          conversions: comparison.delta?.conversions !== undefined ? {
            current: comparison.current.conversions,
            previous: comparison.previous.conversions,
            delta: comparison.delta.conversions,
            deltaPercent: comparison.deltaPercent.conversions,
            trend: comparison.trends.conversions,
          } : null,
          revenue: comparison.delta?.revenue !== undefined ? {
            current: comparison.current.revenue,
            previous: comparison.previous.revenue,
            delta: comparison.delta.revenue,
            deltaPercent: comparison.deltaPercent.revenue,
            trend: comparison.trends.revenue,
          } : null,
          cpa: comparison.delta?.cpa !== undefined ? {
            current: comparison.current.cpa,
            previous: comparison.previous.cpa,
            delta: comparison.delta.cpa,
            deltaPercent: comparison.deltaPercent.cpa,
            trend: comparison.trends.cpa,
          } : null,
          roas: comparison.delta?.roas !== undefined ? {
            current: comparison.current.roas,
            previous: comparison.previous.roas,
            delta: comparison.delta.roas,
            deltaPercent: comparison.deltaPercent.roas,
            trend: comparison.trends.roas,
          } : null,
        },
        planningNotice:
          "Budget planning is strategic advisory only. Historical trends reflect internal snapshot aggregation; conversions represent tracked actions, revenue represents conversion value.",
      };
    }

    default:
      throw Object.assign(new Error(`Worker ${slug} is not a Batch B2 Type B worker`), {
        status: 400,
        code: "INVALID_BATCH_B2_WORKER",
      });
  }
}

/**
 * Loads user-scoped real marketing data for Batch B3 workers (Worker #39 Funnel Drop-off Analyst).
 */
async function loadBatchB3Data(workerSlug, userId, options = {}) {
  if (workerSlug === BATCH_B3_SLUGS.FUNNEL_DROP_OFF_ANALYST) {
    return funnelDropOffService.analyzeFunnelDropOff(userId, options);
  }
  throw Object.assign(new Error(`Worker ${workerSlug} is not a supported Batch B3 worker`), {
    status: 400,
    code: "INVALID_BATCH_B3_WORKER",
  });
}

/**
 * Loads user-scoped real marketing data for any Type B worker (Batch B1, B2, or B3).
 */
async function loadTypeBData(slug, userId, options = {}) {
  if (isBatchB1Worker(slug)) {
    return loadBatchB1Data(slug, userId, options);
  }
  if (isBatchB2Worker(slug)) {
    return loadBatchB2Data(slug, userId, options);
  }
  if (isBatchB3Worker(slug)) {
    return loadBatchB3Data(slug, userId, options);
  }
  throw Object.assign(new Error(`Worker ${slug} is not a supported Type B worker`), {
    status: 400,
    code: "INVALID_TYPE_B_WORKER",
  });
}

function getWorkerSpecificPromptInstructions(slug) {
  switch (slug) {
    case BATCH_B1_SLUGS.ANALYTICS_CEO_DASHBOARD:
      return `WORKER SPECIFIC INSTRUCTIONS (Analytics & CEO Dashboard):
- Synthesize an executive-level marketing analytics dashboard report based strictly on the verified portfolio health and performance metrics provided above.
- Clearly present Health Score, Health Grade, and Portfolio Momentum.
- Evaluate core marketing efficiency metrics: ROAS, CPA, CTR, CPC, Spend, and Conversions.
- Reference any active alerts or underperforming KPI targets identified in the alert rollup.
- If data is empty or all metrics are 0/null, explicitly state that tracking data has not been recorded yet and provide guidance on setting up baseline tracking.
- Do not fabricate figures. Keep tone analytical, objective, and executive-ready.`;

    case BATCH_B1_SLUGS.CAC_ROAS_FUNNEL_ANALYTICS:
      return `WORKER SPECIFIC INSTRUCTIONS (CAC / ROAS / Funnel Analytics):
- Conduct an in-depth analysis of Customer Acquisition Cost (represented by CPA / Cost per Conversion) and Return on Ad Spend (ROAS) across the tracked marketing funnel.
- The funnel stages in verified data are strictly: Spend -> Impressions -> Clicks -> Conversions -> Purchase Value (Revenue).
- FORBIDDEN: Do NOT invent or assume intermediate funnel stages (such as landing page visits, add-to-cart, checkout initiated) because they are not captured in the current snapshot data layer. State in assumptions that intermediate funnel events are not tracked.
- If campaign contributions are provided, detail how top performers and underperformers influence overall portfolio CAC and ROAS.
- If conversion or revenue data is empty/null, state that conversions have not yet been recorded and specify recommendations for tracking setup.`;

    case BATCH_B1_SLUGS.MONTHLY_CEO_STRATEGY_REPORT:
      return `WORKER SPECIFIC INSTRUCTIONS (Monthly CEO Strategy Report):
- Prepare a comprehensive monthly marketing strategy review for executive leadership comparing the current period against the previous period.
- Analyze month-over-month (MoM) growth or contraction in Spend, Conversions, Revenue, ROAS, and CPA using the exact deltas and trend directions provided.
- Assess current portfolio health, momentum, and KPI compliance status.
- Provide actionable, prioritized strategic recommendations for the upcoming monthly cycle based on the trends and alert rollup.
- If current period activity is zero or empty, state clearly that no marketing activity was recorded in the period and outline an activation plan.`;

    case BATCH_B2_SLUGS.MARKETING_ALERT:
      return `WORKER SPECIFIC INSTRUCTIONS (Marketing Alert):
- Analyze all active alerts and KPI compliance evaluated from real ground-truth marketing performance.
- Detail any CRITICAL alerts (critical underperformance, cost overrun) and WARNING alerts (performance decline, target deficit, missing data).
- Explicitly explain the underlying causes using actual metric values, target thresholds, achievement rates, and performance trends.
- Provide actionable, prioritized corrective actions in recommendations (e.g. reallocate budget, review bids, optimize creative/targeting, fix tracking gaps).
- If no alerts exist or no active KPI targets are configured, explicitly state that all monitored targets are currently healthy or that baseline KPI targets need to be established.
- FORBIDDEN: Do NOT hallucinate or fabricate alerts that are not present in activeAlerts. Do NOT invent synthetic metrics or fake target thresholds. Recommendations must NOT create new alerts.`;

    case BATCH_B2_SLUGS.SMART_BUDGET_ALLOCATION:
      return `WORKER SPECIFIC INSTRUCTIONS (Smart Budget Allocation):
- Formulate strategic budget reallocation recommendations based strictly on verified campaign contribution and portfolio benchmark data.
- Analyze the performance gap between top performers and underperformers relative to the portfolio benchmark.
- Propose reallocation of discretionary budget toward top performers while trimming or pausing underperforming campaigns.
- Frame all proposals as strategic advisory recommendations. This is ANALYSIS AND RECOMMENDATION ONLY.
- FORBIDDEN: Do NOT make causal attribution claims ("campaign X caused Y"). The data only reflects relative performance against the benchmark.
- FORBIDDEN: Do NOT fabricate budget caps, expected revenue figures, expected ROAS uplift, or ROI forecasts without empirical backing.
- FORBIDDEN: Do NOT claim integration with Meta Ads API, Google Ads API, or any automated ad platform budget mutation.`;

    case BATCH_B2_SLUGS.ADVANCED_BUDGET_PLANNER:
      return `WORKER SPECIFIC INSTRUCTIONS (Advanced Budget Planner):
- Construct a comprehensive marketing budget plan for the upcoming period based strictly on historical performance and period-over-period comparison trends.
- Evaluate efficiency metrics (ROAS, CPA, CPC, CTR) alongside spend and conversion momentum across periods.
- Allocate budget percentages or strategic weights across marketing objectives/initiatives grounded in observed trend data.
- If historical data is sparse, zero, or missing for any channel or metric, state this data limitation clearly in assumptions and recommend baseline data collection before allocating aggressive budgets.
- FORBIDDEN: Do NOT invent fake historical spend, fake past revenue, fake conversion counts, or fake historical periods.
- FORBIDDEN: Do NOT equate conversions exclusively with purchases or revenue with total company turnover unless explicitly stated in business context.
- FORBIDDEN: Budget recommendations are strategic planning guidance only; do not attempt or claim live ad platform budget execution.`;

    case BATCH_B3_SLUGS.FUNNEL_DROP_OFF_ANALYST:
      return `WORKER SPECIFIC INSTRUCTIONS (Funnel Drop-off Analyst):
- Conduct an in-depth analysis of the advertising-to-conversion funnel drop-off using the verified stages: Impressions -> Clicks -> Conversions.
- Evaluate transition rates: Click-Through Rate (CTR) and Conversion Rate (CVR), alongside the exact lost volume and drop-off percentages between stages.
- Identify the primary observed bottleneck where the highest drop-off occurred among the measured transitions.
- If revenue is recorded, analyze monetary outcomes (AOV, Revenue per Click, ROAS).
- FORBIDDEN: Do NOT invent or assume intermediate on-site funnel stages (such as Landing Page Views, Add To Cart, or Initiated Checkout) because they are not captured in the current snapshot data layer. Explicitly disclose this data limitation in your assumptions.
- FORBIDDEN: Do NOT make causal claims (e.g. "the checkout button is broken" or "page speed caused the drop"). Use observational phrasing ("the largest observed drop occurred between Clicks and Conversions").
- If conversion data shows a view-through discrepancy (conversions > clicks), note this as a multi-conversion or view-through attribution factor.
- If data is empty or zero, clearly state that no funnel activity has been recorded for the period and provide setup recommendations.`;

    default:
      return "";
  }
}

/**
 * Executes a Type B worker (Batch B1 or B2) with user-scoped real data injection.
 * Preserves the common output schema { summary, recommendations, assumptions }.
 */
async function executeTypeBWorker({ worker, context, input, agentContext, userId, options = {} }) {
  const effectiveUserId = userId || context?.userId;
  if (!effectiveUserId || typeof effectiveUserId !== "string") {
    throw Object.assign(new Error("User ID is required for Type B worker data execution"), {
      status: 400,
      code: "USER_ID_REQUIRED",
    });
  }

  // 1. Fetch real marketing data scoped by userId
  const marketingDataContext = await loadTypeBData(worker.slug, effectiveUserId, options);

  // 2. Build bounded context strings
  const contextText = context
    ? Object.entries(context)
        .filter(([k, v]) => !["id", "userId", "createdAt", "updatedAt"].includes(k) && v)
        .map(([k, v]) => `${k}: ${Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n")
    : "No marketing context provided.";

  const agentContextText = agentContext
    ? JSON.stringify(agentContext).slice(0, 5000)
    : "Manual worker execution; no Agent run context.";

  const evaluationCriteriaText = worker.evaluationCriteria?.length
    ? `\nEVALUATION CRITERIA (complete these within the existing output fields; do not add output fields):\n- ${worker.evaluationCriteria.join("\n- ")}`
    : "";

  const realDataText = JSON.stringify(marketingDataContext, null, 2);
  const workerSpecificText = getWorkerSpecificPromptInstructions(worker.slug);

  // 3. Compose AI Prompt with bounded real data and strict safety rules
  const prompt = `SYSTEM: You are an expert marketing strategist and executive analyst. Write every user-facing output in natural Vietnamese.
WORKER: ${worker.name}
INSTRUCTIONS: ${worker.instructions}${evaluationCriteriaText}

MARKETING CONTEXT (Brand / Business Profile):
${contextText.slice(0, 2500)}

AGENT RUN CONTEXT:
${agentContextText}

REAL MARKETING PERFORMANCE DATA (Verified Ground Truth from Internal Marketing Data Layer):
${realDataText}

${workerSpecificText}

OBJECTIVE: ${input.objective}
AUDIENCE: ${input.audience || "Not specified"}
CONSTRAINTS: ${input.constraints || "Not specified"}

CRITICAL SAFETY AND SEMANTIC CONSTRAINTS:
1. STRICT DATA GROUNDING: Use ONLY the metrics provided in the REAL MARKETING PERFORMANCE DATA section above. NEVER invent, hallucinate, or fabricate spend, conversions, revenue, ROAS, or CPA figures.
2. EMPTY DATA HANDLING: If metrics are zero, null, or missing, explicitly state that tracking or campaign data has not yet been recorded for this period, and recommend proper tracking setup. Do NOT pretend data exists.
3. DATA SEMANTICS: "conversions" represent aggregate conversion actions and must not be assumed to be exclusively closed e-commerce sales. "revenue" represents purchase conversion value. CPA is cost per tracked conversion.
4. SCOPE DISCIPLINE: Do not invent unmonitored funnel steps (e.g., checkout/cart steps) or claim external API actions. No causal claims ("X caused Y") without controlled experimentation.
5. NO EXTERNAL SIDE EFFECTS: Recommendations are advisory planning guidance only. Never claim live execution on Meta Ads, Google Ads, or external advertising platforms.
6. IMMUTABLE OUTPUT CONTRACT: Return JSON strictly conforming to the schema with "summary" (string), "recommendations" (array of objects with title, detail, priority), and "assumptions" (array of strings). Keep JSON field names and technical enum values unchanged.`;

  return aiService.generate({ prompt, outputSchema: worker.outputSchema });
}

module.exports = {
  BATCH_B1_SLUGS,
  BATCH_B2_SLUGS,
  BATCH_B3_SLUGS,
  isBatchB1Worker,
  isBatchB2Worker,
  isBatchB3Worker,
  isTypeBWorker,
  resolveMonthlyPeriod,
  loadBatchB1Data,
  loadBatchB2Data,
  loadBatchB3Data,
  loadTypeBData,
  executeTypeBWorker,
};
