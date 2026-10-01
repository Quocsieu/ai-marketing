const prisma = require("../../config/database");
const { decryptToken } = require("../meta/tokenEncryption");
const { MetaAdsProvider } = require("../meta/metaAdsProvider");

const metaAdsProvider = new MetaAdsProvider();
const { normalizeAdAccountId, normalizeObjectId } = require("../meta/metaAdsProvider");
const { buildCampaignSpecification, campaignSpecificationSchema } = require("./campaignSpecification");

function error(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function getConnection(userId, { requireAccount = false } = {}) {
  const connection = await prisma.metaConnection.findUnique({ where: { userId } });
  if (!connection) throw error(404, "META_NOT_CONNECTED", "Connect a Meta account before using Meta Ads.");
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
    throw error(401, "META_REAUTH_REQUIRED", "Your Meta session has expired. Reconnect your account.");
  }
  if (requireAccount && !connection.adAccountId) {
    throw error(400, "META_AD_ACCOUNT_REQUIRED", "Select a Meta ad account in Settings first.");
  }
  try {
    return { connection, accessToken: decryptToken(connection.accessToken) };
  } catch {
    throw error(503, "META_CREDENTIAL_UNAVAILABLE", "The stored Meta credential is unavailable. Reconnect your account.");
  }
}

async function status(userId) {
  const connection = await prisma.metaConnection.findUnique({
    where: { userId },
    select: {
      provider: true,
      metaUserId: true,
      adAccountId: true,
      adAccountName: true,
      adAccountCurrency: true,
      pageId: true,
      pageName: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  if (!connection) return { connected: false };
  const expired = Boolean(connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000);
  return {
    connected: !expired,
    reauthorizationRequired: expired,
    provider: connection.provider,
    metaUserId: connection.metaUserId,
    adAccount: connection.adAccountId ? {
      id: connection.adAccountId,
      name: connection.adAccountName,
      currency: connection.adAccountCurrency,
    } : null,
    page: connection.pageId ? { id: connection.pageId, name: connection.pageName } : null,
    scopes: connection.scopes.split(",").filter(Boolean),
    expiresAt: connection.expiresAt,
    connectedAt: connection.createdAt,
  };
}

async function getAdAccounts(userId) {
  const { accessToken } = await getConnection(userId);
  return metaAdsProvider.getAdAccounts(accessToken);
}

async function getPages(userId) {
  const { accessToken } = await getConnection(userId);
  return metaAdsProvider.getPages(accessToken);
}

async function selectAssets(userId, input) {
  const { connection, accessToken } = await getConnection(userId);
  const [accounts, pages] = await Promise.all([
    input.adAccountId === undefined ? null : metaAdsProvider.getAdAccounts(accessToken),
    input.pageId === undefined ? null : metaAdsProvider.getPages(accessToken),
  ]);
  const update = {};
  if (input.adAccountId !== undefined) {
    const selected = input.adAccountId === null ? null : accounts.find((item) => item.id === input.adAccountId);
    if (input.adAccountId !== null && !selected) throw error(403, "META_AD_ACCOUNT_FORBIDDEN", "That ad account is not available to the connected Meta user.");
    update.adAccountId = selected?.id || null;
    update.adAccountName = selected?.name || null;
    update.adAccountCurrency = selected?.currency || null;
  }
  if (input.pageId !== undefined) {
    const selected = input.pageId === null ? null : pages.find((item) => item.id === input.pageId);
    if (input.pageId !== null && !selected) throw error(403, "META_PAGE_FORBIDDEN", "That Page is not available to the connected Meta user.");
    update.pageId = selected?.id || null;
    update.pageName = selected?.name || null;
  }
  const saved = await prisma.metaConnection.update({ where: { id: connection.id }, data: update });
  return {
    adAccount: saved.adAccountId ? { id: saved.adAccountId, name: saved.adAccountName, currency: saved.adAccountCurrency } : null,
    page: saved.pageId ? { id: saved.pageId, name: saved.pageName } : null,
  };
}

async function createCampaignSpecification(userId, runId) {
  const { connection } = await getConnection(userId, { requireAccount: true });
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw error(404, "AGENT_RUN_NOT_FOUND", "Agent run not found.");
  if (run.status !== "SUCCEEDED" || !run.finalOutput) throw error(409, "AGENT_RUN_NOT_COMPLETE", "Campaign specifications are available after an Agent run completes successfully.");
  const context = await prisma.marketingContext.findUnique({ where: { userId } });
  const specification = campaignSpecificationSchema.parse(buildCampaignSpecification({ run, context, connection }));
  return {
    agentRunId: run.id,
    productName: run.productInput?.name || "",
    campaign: specification,
    adAccount: { id: connection.adAccountId, name: connection.adAccountName, currency: connection.adAccountCurrency },
    page: connection.pageId ? { id: connection.pageId, name: connection.pageName } : null,
    deliveryNote: "Approve creates a Meta campaign in PAUSED status. This MVP does not create an ad set or ad, so no ad will be delivered or charged.",
  };
}

function minorUnits(amount, currency) {
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  const multiplier = 10 ** fractionDigits;
  const minor = Math.round(amount * multiplier);
  if (!Number.isSafeInteger(minor)) throw error(400, "META_INVALID_BUDGET", "Daily budget is too large for the selected currency.");
  return minor;
}

async function createCampaign(userId, { runId, specification }) {
  const { connection, accessToken } = await getConnection(userId, { requireAccount: true });
  const spec = campaignSpecificationSchema.parse(specification);
  if (spec.currency !== connection.adAccountCurrency) throw error(400, "META_CURRENCY_MISMATCH", "The campaign currency must match the selected ad account.");
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId }, select: { id: true, status: true, finalOutput: true } });
  if (!run) throw error(404, "AGENT_RUN_NOT_FOUND", "Agent run not found.");
  if (run.status !== "SUCCEEDED" || !run.finalOutput) throw error(409, "AGENT_RUN_NOT_COMPLETE", "Only a completed Agent run can be sent to Meta.");
  const existing = await prisma.metaCampaign.findUnique({ where: { agentRunId: runId } });
  if (existing?.externalCampaignId || ["CREATING", "UNKNOWN", "PAUSED", "ACTIVE"].includes(existing?.status)) {
    throw error(409, "META_CAMPAIGN_ALREADY_CREATED", "A Meta campaign has already been created or may still be processing for this Agent run.");
  }
  const dailyBudgetMinor = spec.dailyBudget ? minorUnits(spec.dailyBudget, spec.currency) : null;
  if (dailyBudgetMinor === null) throw error(400, "META_INVALID_BUDGET", "Enter a daily budget before approving this campaign.");
  let saved;
  if (existing) {
    const claimed = await prisma.metaCampaign.updateMany({
      where: { id: existing.id, status: "FAILED", externalCampaignId: null },
      data: { connectionId: connection.id, adAccountId: connection.adAccountId, name: spec.name, objective: spec.objective, status: "CREATING", specification: { ...spec, dailyBudgetMinor } },
    });
    if (!claimed.count) throw error(409, "META_CAMPAIGN_ALREADY_CREATED", "A Meta campaign has already been created or may still be processing for this Agent run.");
    saved = await prisma.metaCampaign.findUnique({ where: { id: existing.id } });
  } else {
    saved = await prisma.metaCampaign.create({
        data: { userId, connectionId: connection.id, agentRunId: runId, adAccountId: connection.adAccountId, name: spec.name, objective: spec.objective, status: "CREATING", specification: { ...spec, dailyBudgetMinor } },
      });
  }
  let remoteCampaignId = null;
  try {
    const remote = await metaAdsProvider.createCampaign({
      accessToken,
      adAccountId: connection.adAccountId,
      specification: { ...spec, dailyBudgetMinor },
    });
    if (typeof remote.id !== "string" || !/^\d{1,40}$/.test(remote.id)) {
      await prisma.metaCampaign.update({ where: { id: saved.id }, data: { status: "UNKNOWN", errorCode: "META_INVALID_CREATE_RESPONSE" } });
      throw error(502, "META_CAMPAIGN_RESULT_UNKNOWN", "Meta did not return a valid campaign id. Check Ads Manager before retrying.");
    }
    remoteCampaignId = remote.id;
    const campaign = await prisma.metaCampaign.update({
      where: { id: saved.id },
      data: { externalCampaignId: remote.id, status: "PAUSED", errorCode: null },
    });
    return {
      id: campaign.id,
      externalCampaignId: remote.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      adAccountId: campaign.adAccountId,
      specification: campaign.specification,
    };
  } catch (cause) {
    if (remoteCampaignId) {
      await prisma.metaCampaign.update({
        where: { id: saved.id },
        data: { externalCampaignId: remoteCampaignId, status: "PAUSED", errorCode: "META_LOCAL_SAVE_RECOVERED" },
      }).catch(() => {});
      throw error(502, "META_CAMPAIGN_RESULT_UNKNOWN", "Meta created the campaign but local confirmation failed. Check the campaign in Meta before retrying.");
    }
    if (cause.code === "META_API_UNAVAILABLE" || cause.code === "META_CAMPAIGN_RESULT_UNKNOWN") {
      await prisma.metaCampaign.update({ where: { id: saved.id }, data: { status: "UNKNOWN", errorCode: cause.code } }).catch(() => {});
      if (cause.code === "META_CAMPAIGN_RESULT_UNKNOWN") throw cause;
      throw error(502, "META_CAMPAIGN_RESULT_UNKNOWN", "Meta did not confirm whether the campaign was created. Check Ads Manager before retrying.");
    }
    await prisma.metaCampaign.update({ where: { id: saved.id }, data: { status: "FAILED", errorCode: cause.metaCode ? String(cause.metaCode) : cause.code || "META_API_ERROR" } }).catch(() => {});
    throw cause;
  }
}

async function getCampaign(userId, externalCampaignId) {
  const campaign = await prisma.metaCampaign.findFirst({ where: { userId, externalCampaignId } });
  if (!campaign) throw error(404, "META_CAMPAIGN_NOT_FOUND", "Meta campaign not found.");
  const { connection, accessToken } = await getConnection(userId);
  if (campaign.connectionId && campaign.connectionId !== connection.id) throw error(403, "META_CAMPAIGN_FORBIDDEN", "This campaign does not belong to the connected Meta account.");
  const remote = await metaAdsProvider.getCampaign({ accessToken, campaignId: campaign.externalCampaignId });
  const accountId = normalizeAdAccountId(remote.account_id);
  if (!accountId || accountId !== normalizeAdAccountId(campaign.adAccountId)) throw error(403, "META_CAMPAIGN_FORBIDDEN", "This campaign is outside the selected ad account.");
  const saved = await prisma.metaCampaign.update({ where: { id: campaign.id }, data: { status: remote.status } });
  return { id: saved.id, externalCampaignId: saved.externalCampaignId, name: remote.name, objective: remote.objective, status: remote.status, adAccountId: saved.adAccountId, specification: saved.specification };
}

async function changeCampaignStatus(userId, externalCampaignId, status, confirmed = false) {
  if (status === "ACTIVE" && confirmed !== true) throw error(400, "META_LAUNCH_CONFIRMATION_REQUIRED", "Explicit confirmation is required before launching a campaign.");
  const campaign = await prisma.metaCampaign.findFirst({ where: { userId, externalCampaignId } });
  if (!campaign) throw error(404, "META_CAMPAIGN_NOT_FOUND", "Meta campaign not found.");
  const { connection, accessToken } = await getConnection(userId);
  if (campaign.connectionId && campaign.connectionId !== connection.id) throw error(403, "META_CAMPAIGN_FORBIDDEN", "This campaign does not belong to the connected Meta account.");
  if (status === "ACTIVE" && campaign.status !== "PAUSED") throw error(409, "META_CAMPAIGN_STATE_CONFLICT", "Only a paused campaign can be launched.");
  const remote = status === "ACTIVE"
    ? await metaAdsProvider.resumeCampaign({ accessToken, campaignId: campaign.externalCampaignId })
    : await metaAdsProvider.pauseCampaign({ accessToken, campaignId: campaign.externalCampaignId });
  if (remote.success !== true) throw error(502, "META_CAMPAIGN_STATUS_FAILED", "Meta did not confirm the campaign status change.");
  const saved = await prisma.metaCampaign.update({ where: { id: campaign.id }, data: { status } });
  return { externalCampaignId: campaign.externalCampaignId, status: saved.status };
}

async function listCampaigns(userId) {
  return prisma.metaCampaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, externalCampaignId: true, agentRunId: true, adAccountId: true, name: true, objective: true, status: true, errorCode: true, createdAt: true },
  });
}

async function disconnect(userId) {
  await prisma.metaConnection.deleteMany({ where: { userId } });
  await prisma.metaOAuthState.deleteMany({ where: { userId } });
  return { disconnected: true };
}

module.exports = {
  status,
  getAdAccounts,
  getPages,
  selectAssets,
  createCampaignSpecification,
  createCampaign,
  getCampaign,
  changeCampaignStatus,
  listCampaigns,
  disconnect,
};
