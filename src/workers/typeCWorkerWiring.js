const adsService = require("../services/ads/adsService");
const marketingDataService = require("../services/marketing/marketingDataService");
const marketingContributionService = require("../services/marketing/marketingContributionService");
const actionProposalService = require("../services/actions/actionProposalService");
const aiService = require("../services/ai/aiService");

const TYPE_C_SLUGS = Object.freeze({
  FULL_ADS_COPILOT: "full-ads-copilot",
});

function isTypeCWorker(slug) {
  return Object.values(TYPE_C_SLUGS).includes(slug);
}

/**
 * Extended output schema for Type C Worker #27.
 * Fully backward-compatible with common { summary, recommendations, assumptions }.
 */
const typeCOutputSchema = {
  type: "object",
  required: ["summary", "recommendations", "assumptions"],
  properties: {
    summary: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "detail", "priority"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    proposedActions: {
      type: "array",
      items: {
        type: "object",
        required: ["actionType", "targetExternalId", "targetObjectType", "payload", "reason"],
        properties: {
          actionType: { type: "string", enum: ["PAUSE_CAMPAIGN"] },
          targetExternalId: { type: "string" },
          targetObjectType: { type: "string", enum: ["CAMPAIGN"] },
          payload: {
            type: "object",
            required: ["campaignId", "status"],
            properties: {
              campaignId: { type: "string" },
              status: { type: "string", enum: ["PAUSED"] },
            },
          },
          reason: { type: "string" },
        },
      },
    },
  },
};

/**
 * Loads read-only marketing and Meta campaign performance data for Worker #27.
 */
async function loadTypeCData(userId, options = {}) {
  const [campaignsResult, aggregatedResult, contributionsResult] = await Promise.all([
    adsService.listCampaigns(userId).catch(() => []),
    marketingDataService.getAggregatedMetrics(userId, options).catch(() => null),
    marketingContributionService.analyzeCampaignContribution(userId, options).catch(() => null),
  ]);

  const rawCampaigns = Array.isArray(campaignsResult) ? campaignsResult : [];
  const campaigns = rawCampaigns.map((c) => ({
    id: c.externalCampaignId || c.id,
    name: c.name || "Untitled Campaign",
    status: c.status || "UNKNOWN",
    objective: c.objective || null,
  }));

  return {
    campaigns,
    portfolioMetrics: aggregatedResult
      ? {
          spend: aggregatedResult.spend,
          impressions: aggregatedResult.impressions,
          clicks: aggregatedResult.clicks,
          conversions: aggregatedResult.conversions,
          revenue: aggregatedResult.revenue,
          ctr: aggregatedResult.ctr,
          cpc: aggregatedResult.cpc,
          cpa: aggregatedResult.cpa,
          roas: aggregatedResult.roas,
        }
      : null,
    benchmarkMetric: contributionsResult?.benchmarkMetric || null,
    benchmarkValue: contributionsResult?.benchmarkValue || null,
    underperformers: (contributionsResult?.underperformers || []).map((u) => ({
      id: u.externalId,
      metric: u.metric,
      relativeGap: u.relativeGap,
    })),
  };
}

/**
 * Executes Worker #27 (Full Ads Copilot) with Type C Action Proposal capability.
 * Enforces Zero Direct Mutation: Worker only creates PENDING ActionProposals.
 */
async function executeTypeCWorker({ worker, context, input, agentContext, userId, options = {} }) {
  const effectiveUserId = userId || context?.userId;
  if (!effectiveUserId || typeof effectiveUserId !== "string") {
    throw Object.assign(new Error("User ID is required for Type C worker execution"), {
      status: 400,
      code: "USER_ID_REQUIRED",
    });
  }

  // 1. Fetch read-only real marketing & campaign data
  const realData = await loadTypeCData(effectiveUserId, options);

  // Collect verified active/known campaign IDs to validate against AI hallucinations
  const verifiedCampaignIds = new Set(realData.campaigns.map((c) => String(c.id)));

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

  const realDataText = JSON.stringify(realData, null, 2);

  // 3. Compose AI Prompt
  const prompt = `SYSTEM: You are an expert ads strategist and marketing copilot (Full Ads Copilot). Write every user-facing output in natural Vietnamese.
WORKER: ${worker.name}
INSTRUCTIONS: ${worker.instructions}

MARKETING CONTEXT (Brand Profile):
${contextText.slice(0, 2500)}

AGENT RUN CONTEXT:
${agentContextText}

VERIFIED META CAMPAIGNS AND PERFORMANCE DATA (Ground Truth):
${realDataText}

WORKER SPECIFIC INSTRUCTIONS (Full Ads Copilot - Action Proposals):
1. Review the verified campaigns and portfolio metrics provided above.
2. Formulate strategic, high-value optimization recommendations for the advertising portfolio.
3. If any campaign is clearly underperforming, declining, or wasting ad spend relative to benchmarks, you may propose pausing it by adding an item to the 'proposedActions' array.
4. FORBIDDEN: NEVER attempt to execute any actions directly. You do NOT have direct access to Meta APIs. All actions must be returned as proposals only.
5. RESTRICTION: The only supported actionType is "PAUSE_CAMPAIGN". Do NOT invent other action types.
6. RESTRICTION: targetExternalId MUST be one of the exact verified campaign IDs from the list above: [${Array.from(verifiedCampaignIds).join(", ")}]. Never hallucinate fake IDs.
7. RESTRICTION: targetObjectType must be "CAMPAIGN".
8. RESTRICTION: payload must be strictly {"campaignId": "<exact id>", "status": "PAUSED"}.
9. RESTRICTION: reason must be a clear explanation (10-1000 characters) grounded in the provided data.
10. If no campaign needs to be paused, leave 'proposedActions' as an empty array [].

OBJECTIVE: ${input.objective}
AUDIENCE: ${input.audience || "Not specified"}
CONSTRAINTS: ${input.constraints || "Not specified"}

CRITICAL SAFETY RULES:
- Never fabricate spend, clicks, conversions, or campaign IDs.
- Never output arbitrary URLs, accessToken, secrets, or shell commands.
- Return JSON strictly matching the schema with summary, recommendations, assumptions, and optional proposedActions.`;

  // 4. Generate AI output
  const generated = await aiService.generate({
    prompt,
    outputSchema: typeCOutputSchema,
  });

  const output = generated?.output || generated;
  const rawProposedActions = Array.isArray(output.proposedActions) ? output.proposedActions : [];

  // 5. Backend Ground-Truth Validation of proposedActions
  const validatedCreatedProposals = [];
  const safeProposedActions = [];

  for (const action of rawProposedActions.slice(0, 3)) {
    const targetId = String(action.targetExternalId || "").trim();

    // Verify targetExternalId belongs to the actual campaigns of this user
    if (!verifiedCampaignIds.has(targetId)) {
      continue; // Drop hallucinated or unverified campaign IDs
    }

    if (action.actionType !== "PAUSE_CAMPAIGN" || action.targetObjectType !== "CAMPAIGN") {
      continue;
    }

    if (!action.payload || String(action.payload.campaignId).trim() !== targetId || action.payload.status !== "PAUSED") {
      continue;
    }

    const reason = String(action.reason || "").trim();
    if (reason.length < 10) {
      continue;
    }

    // Persist as PENDING ActionProposal
    try {
      const proposalResult = await actionProposalService.createProposal(effectiveUserId, {
        channel: "meta",
        actionType: "PAUSE_CAMPAIGN",
        targetExternalId: targetId,
        targetObjectType: "CAMPAIGN",
        payload: {
          campaignId: targetId,
          status: "PAUSED",
        },
        reason,
      });

      safeProposedActions.push({
        actionType: "PAUSE_CAMPAIGN",
        targetExternalId: targetId,
        targetObjectType: "CAMPAIGN",
        payload: { campaignId: targetId, status: "PAUSED" },
        reason,
        proposalId: proposalResult.proposal?.id || null,
        proposalStatus: proposalResult.proposal?.status || "PENDING",
      });

      if (proposalResult.created) {
        validatedCreatedProposals.push(proposalResult.proposal);
      }
    } catch (createErr) {
      // Do not crash worker execution if proposal persistence encounters a transient error
      console.error("ActionProposal creation warning:", createErr.message);
    }
  }

  return {
    provider: generated.provider,
    model: generated.model,
    output: {
      summary: output.summary,
      recommendations: output.recommendations,
      assumptions: output.assumptions,
      proposedActions: safeProposedActions,
    },
  };
}

module.exports = {
  TYPE_C_SLUGS,
  isTypeCWorker,
  typeCOutputSchema,
  loadTypeCData,
  executeTypeCWorker,
};
