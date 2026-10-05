const prisma = require("../../config/database");

function createError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function parseUtcDate(value, isEndOfDay = false) {
  if (!value) return null;
  let d;
  if (value instanceof Date) {
    d = new Date(value.getTime());
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      d = new Date(`${trimmed}T${isEndOfDay ? "23:59:59.999Z" : "00:00:00.000Z"}`);
    } else {
      d = new Date(trimmed);
    }
  } else if (typeof value === "number") {
    d = new Date(value);
  } else {
    return null;
  }

  if (isNaN(d.getTime())) return null;

  if (isEndOfDay) {
    d.setUTCHours(23, 59, 59, 999);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

function formatDateIso(d) {
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function round(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeDivide(numerator, denominator, multiplier = 1, decimals = 2) {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  const result = (numerator / denominator) * multiplier;
  return Number.isFinite(result) ? round(result, decimals) : null;
}

function validateDateRange(options = {}) {
  const rawFrom = options.dateFrom || options.since;
  const rawTo = options.dateTo || options.until;

  if (!rawFrom && !rawTo) return null;

  const dateFilter = {};

  if (rawFrom) {
    const fromDate = parseUtcDate(rawFrom, false);
    if (!fromDate) {
      throw createError(400, "INVALID_DATE_FORMAT", `Invalid dateFrom: ${rawFrom}. Use YYYY-MM-DD.`);
    }
    dateFilter.gte = fromDate;
  }

  if (rawTo) {
    const toDate = parseUtcDate(rawTo, true);
    if (!toDate) {
      throw createError(400, "INVALID_DATE_FORMAT", `Invalid dateTo: ${rawTo}. Use YYYY-MM-DD.`);
    }
    dateFilter.lte = toDate;
  }

  if (dateFilter.gte && dateFilter.lte && dateFilter.gte > dateFilter.lte) {
    throw createError(400, "INVALID_DATE_RANGE", "dateFrom must be on or before dateTo.");
  }

  return dateFilter;
}

/**
 * Computes deterministic transition metrics between two adjacent funnel stages.
 */
function computeTransition(fromStage, toStage, fromVolume, toVolume, metricName) {
  if (fromVolume === null || fromVolume === undefined || fromVolume <= 0 || !Number.isFinite(fromVolume)) {
    return {
      from: fromStage,
      to: toStage,
      metricName,
      conversionRate: null,
      dropOffRate: null,
      lostVolume: null,
    };
  }

  const safeTo = Number.isFinite(toVolume) && toVolume >= 0 ? toVolume : 0;
  const conversionRate = round((safeTo / fromVolume) * 100, 2);
  const lostVolume = Math.max(0, fromVolume - safeTo);

  // If nextStage > previousStage (e.g. view-through conversions), clamp dropOffRate to 0 (no negative drop-off)
  const dropOffRate = safeTo > fromVolume ? 0 : round((lostVolume / fromVolume) * 100, 2);

  return {
    from: fromStage,
    to: toStage,
    metricName,
    conversionRate,
    dropOffRate,
    lostVolume,
  };
}

/**
 * Core pure calculation: transforms an array of snapshot rows into a complete Funnel Analysis object.
 */
function calculateFunnel(snapshots = [], options = {}) {
  const anomalies = [];

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalSpend = 0;
  let totalRevenue = 0;
  let hasRevenue = false;

  for (const s of snapshots) {
    if (!s) continue;
    if (Number.isFinite(s.impressions)) totalImpressions += Math.floor(s.impressions);
    if (Number.isFinite(s.clicks)) totalClicks += Math.floor(s.clicks);
    if (Number.isFinite(s.conversions)) totalConversions += s.conversions;
    if (Number.isFinite(s.spend)) totalSpend += s.spend;
    if (Number.isFinite(s.revenue) && s.revenue !== null) {
      totalRevenue += s.revenue;
      hasRevenue = true;
    }
  }

  totalConversions = round(totalConversions, 2);
  totalSpend = round(totalSpend, 2);
  const revenue = hasRevenue ? round(totalRevenue, 2) : null;

  // Rate calculations strictly from aggregate totals
  const ctr = totalImpressions > 0 ? safeDivide(totalClicks, totalImpressions, 100, 2) : null;
  const cvr = totalClicks > 0 ? safeDivide(totalConversions, totalClicks, 100, 2) : null;
  const overallConversionRate = totalImpressions > 0 ? safeDivide(totalConversions, totalImpressions, 100, 4) : null;
  const roas = (totalSpend > 0 && revenue !== null) ? safeDivide(revenue, totalSpend, 1, 4) : null;
  const aov = (revenue !== null && totalConversions > 0) ? safeDivide(revenue, totalConversions, 1, 2) : null;
  const rpc = (revenue !== null && totalClicks > 0) ? safeDivide(revenue, totalClicks, 1, 2) : null;
  const cpa = (totalConversions > 0 && totalSpend > 0) ? safeDivide(totalSpend, totalConversions, 1, 2) : null;
  const cpc = (totalClicks > 0 && totalSpend > 0) ? safeDivide(totalSpend, totalClicks, 1, 2) : null;

  // Anomaly checks
  if (totalConversions > totalClicks && totalClicks > 0) {
    anomalies.push({
      type: "VIEW_THROUGH_DISCREPANCY",
      severity: "INFO",
      message: "Recorded conversions exceed clicks, indicating view-through attribution or multi-conversion events.",
    });
  }
  if (totalClicks > totalImpressions && totalImpressions > 0) {
    anomalies.push({
      type: "CLICKS_EXCEED_IMPRESSIONS",
      severity: "WARNING",
      message: "Recorded clicks exceed impressions, indicating data discrepancy or tracking anomaly.",
    });
  }

  // Stages
  const stages = [
    {
      stageOrder: 1,
      name: "Impressions",
      volume: totalImpressions,
      unit: "exposures",
    },
    {
      stageOrder: 2,
      name: "Clicks",
      volume: totalClicks,
      unit: "clicks",
    },
    {
      stageOrder: 3,
      name: "Conversions",
      volume: totalConversions,
      unit: "conversions",
    },
  ];

  // Transitions
  const transition1 = computeTransition("Impressions", "Clicks", totalImpressions, totalClicks, "CTR");
  const transition2 = computeTransition("Clicks", "Conversions", totalClicks, totalConversions, "CVR");
  const transitions = [transition1, transition2];

  // Bottleneck identification: largest observed drop-off among valid transitions
  const validTransitions = transitions.filter((t) => typeof t.dropOffRate === "number");
  let bottleneck = null;
  if (validTransitions.length > 0) {
    let highest = validTransitions[0];
    for (let i = 1; i < validTransitions.length; i += 1) {
      if (validTransitions[i].dropOffRate > highest.dropOffRate) {
        highest = validTransitions[i];
      }
    }
    const rate = highest.dropOffRate;
    const severity = rate >= 90 ? "HIGH" : (rate >= 50 ? "MEDIUM" : "LOW");
    bottleneck = {
      stage: `${highest.from} -> ${highest.to}`,
      metricName: highest.metricName,
      observedDropOffRate: rate,
      lostVolume: highest.lostVolume,
      severity,
    };
  }

  const dataLimitations = [
    "Intermediate on-site session stages (Landing Page Views, Add To Cart, Initiated Checkout) are not captured in current metric snapshots.",
    "Conversions represent recorded campaign goal actions (e.g. leads, registrations, purchases) based on ad provider configuration, not strictly e-commerce purchases.",
    "Analysis represents advertising delivery drop-off; causality cannot be inferred without on-site telemetry.",
  ];

  // Multi-campaign breakdown when portfolio-level
  let campaignBreakdown = null;
  if (!options.externalId && snapshots.length > 0) {
    const campaignMap = new Map();
    for (const s of snapshots) {
      if (!s) continue;
      const cId = s.externalId || "UNKNOWN";
      if (!campaignMap.has(cId)) {
        campaignMap.set(cId, []);
      }
      campaignMap.get(cId).push(s);
    }

    if (campaignMap.size > 1) {
      campaignBreakdown = [];
      for (const [cId, rows] of campaignMap.entries()) {
        let cImp = 0;
        let cClk = 0;
        let cCnv = 0;
        let cSpd = 0;
        let cRev = 0;
        let cHasRev = false;

        for (const r of rows) {
          if (Number.isFinite(r.impressions)) cImp += Math.floor(r.impressions);
          if (Number.isFinite(r.clicks)) cClk += Math.floor(r.clicks);
          if (Number.isFinite(r.conversions)) cCnv += r.conversions;
          if (Number.isFinite(r.spend)) cSpd += r.spend;
          if (Number.isFinite(r.revenue) && r.revenue !== null) {
            cRev += r.revenue;
            cHasRev = true;
          }
        }

        cCnv = round(cCnv, 2);
        cSpd = round(cSpd, 2);
        const cRevenue = cHasRev ? round(cRev, 2) : null;
        const cCtr = cImp > 0 ? safeDivide(cClk, cImp, 100, 2) : null;
        const cCvr = cClk > 0 ? safeDivide(cCnv, cClk, 100, 2) : null;
        const cDropOff = cClk > 0 ? (cCnv > cClk ? 0 : round(((cClk - cCnv) / cClk) * 100, 2)) : null;
        const cRoas = (cSpd > 0 && cRevenue !== null) ? safeDivide(cRevenue, cSpd, 1, 4) : null;

        campaignBreakdown.push({
          externalId: cId,
          impressions: cImp,
          clicks: cClk,
          conversions: cCnv,
          spend: cSpd,
          revenue: cRevenue,
          ctr: cCtr,
          cvr: cCvr,
          dropOffRate: cDropOff,
          roas: cRoas,
          recordCount: rows.length,
        });
      }

      // Deterministic sort: 1. CVR ascending (lowest conversion rate first), 2. spend desc, 3. externalId asc
      campaignBreakdown.sort((a, b) => {
        const cvrA = a.cvr !== null ? a.cvr : -1;
        const cvrB = b.cvr !== null ? b.cvr : -1;
        if (cvrA !== cvrB) return cvrA - cvrB;
        if (b.spend !== a.spend) return b.spend - a.spend;
        return String(a.externalId).localeCompare(String(b.externalId));
      });
    }
  }

  const rawFrom = options.dateFrom || options.since;
  const rawTo = options.dateTo || options.until;

  return {
    scope: {
      userId: options.userId || null,
      channel: options.channel ? String(options.channel).toLowerCase() : "all",
      objectType: options.objectType || "CAMPAIGN",
      externalId: options.externalId || null,
      period: {
        dateFrom: rawFrom ? formatDateIso(parseUtcDate(rawFrom)) : null,
        dateTo: rawTo ? formatDateIso(parseUtcDate(rawTo, true)) : null,
      },
    },
    summary: {
      totalImpressions,
      totalClicks,
      totalConversions,
      overallConversionRate,
      spend: totalSpend,
      revenue,
      roas,
      aov,
      rpc,
      cpa,
      cpc,
      recordCount: snapshots.length,
    },
    stages,
    transitions,
    bottleneck,
    dataLimitations,
    anomalies,
    ...(campaignBreakdown ? { campaignBreakdown } : {}),
  };
}

/**
 * Analyzes funnel drop-off for a specific user and options.
 * Enforces user isolation, CAMPAIGN level isolation, and safe UTC date filtering.
 */
async function analyzeFunnelDropOff(userId, options = {}) {
  if (!userId || typeof userId !== "string") {
    throw createError(400, "USER_ID_REQUIRED", "User ID is required.");
  }

  const effectiveOptions = { ...options };

  // Double-counting protection: always default strictly to objectType = "CAMPAIGN"
  const objectType = effectiveOptions.objectType ? String(effectiveOptions.objectType).toUpperCase() : "CAMPAIGN";
  effectiveOptions.objectType = objectType;

  const where = {
    userId,
    objectType,
  };

  if (effectiveOptions.channel) {
    where.channel = String(effectiveOptions.channel).toLowerCase();
  }

  if (effectiveOptions.externalId) {
    where.externalId = String(effectiveOptions.externalId);
  }

  const dateFilter = validateDateRange(effectiveOptions);
  if (dateFilter) {
    where.date = dateFilter;
  }

  // Single batched Prisma query (No N+1 risk)
  const snapshots = await prisma.marketingMetricSnapshot.findMany({
    where,
    select: {
      id: true,
      userId: true,
      channel: true,
      externalId: true,
      objectType: true,
      date: true,
      spend: true,
      impressions: true,
      clicks: true,
      ctr: true,
      cpc: true,
      conversions: true,
      revenue: true,
      roas: true,
      cpa: true,
    },
    orderBy: [{ date: "asc" }, { externalId: "asc" }],
  });

  return calculateFunnel(snapshots, {
    ...effectiveOptions,
    userId,
  });
}

module.exports = {
  createError,
  parseUtcDate,
  formatDateIso,
  round,
  safeDivide,
  validateDateRange,
  computeTransition,
  calculateFunnel,
  analyzeFunnelDropOff,
};
