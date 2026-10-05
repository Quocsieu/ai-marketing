const prisma = require("../../config/database");
const { MetaAdsProvider, normalizeObjectId, normalizeAdAccountId } = require("../meta/metaAdsProvider");
const tokenEncryption = require("../meta/tokenEncryption");
const actionAuditService = require("./actionAuditService");

const metaAdsProvider = new MetaAdsProvider();

const WHITELIST_CHANNELS = new Set(["meta"]);
const WHITELIST_ACTION_TYPES = new Set(["PAUSE_CAMPAIGN"]);
const WHITELIST_OBJECT_TYPES = new Set(["CAMPAIGN"]);

function createError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Validates input parameters for creating a new ActionProposal.
 */
function validateProposalInput({
  channel,
  actionType,
  targetExternalId,
  targetObjectType,
  payload,
  reason,
}) {
  if (!channel || !WHITELIST_CHANNELS.has(String(channel).toLowerCase())) {
    throw createError(400, "INVALID_CHANNEL", `Channel must be one of: ${Array.from(WHITELIST_CHANNELS).join(", ")}`);
  }

  if (!actionType || !WHITELIST_ACTION_TYPES.has(actionType)) {
    throw createError(400, "INVALID_ACTION_TYPE", `actionType must be one of: ${Array.from(WHITELIST_ACTION_TYPES).join(", ")}`);
  }

  if (!targetObjectType || !WHITELIST_OBJECT_TYPES.has(targetObjectType)) {
    throw createError(400, "INVALID_TARGET_OBJECT_TYPE", `targetObjectType must be one of: ${Array.from(WHITELIST_OBJECT_TYPES).join(", ")}`);
  }

  const idStr = String(targetExternalId || "").trim();
  if (!/^\d{1,40}$/.test(idStr)) {
    throw createError(400, "INVALID_TARGET_EXTERNAL_ID", "targetExternalId must be a valid numeric ID string (1-40 digits).");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createError(400, "INVALID_PAYLOAD", "Payload must be a non-null object.");
  }

  if (String(payload.campaignId || "").trim() !== idStr) {
    throw createError(400, "PAYLOAD_MISMATCH", "payload.campaignId must match targetExternalId.");
  }

  if (payload.status !== "PAUSED") {
    throw createError(400, "INVALID_PAYLOAD_STATUS", "payload.status must be 'PAUSED' for PAUSE_CAMPAIGN.");
  }

  // Security check: reject payloads containing sensitive fields or arbitrary URLs
  const forbiddenKeys = ["accesstoken", "token", "secret", "password", "url", "endpoint", "method", "headers"];
  for (const key of Object.keys(payload)) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      throw createError(400, "SECURITY_VIOLATION", `Payload contains forbidden field: ${key}`);
    }
  }

  const reasonStr = String(reason || "").trim();
  if (reasonStr.length < 10 || reasonStr.length > 1000) {
    throw createError(400, "INVALID_REASON", "Reason must be between 10 and 1000 characters.");
  }

  return {
    channel: String(channel).toLowerCase(),
    actionType,
    targetExternalId: idStr,
    targetObjectType,
    payload: {
      campaignId: idStr,
      status: "PAUSED",
      ...(payload.executionId ? { executionId: String(payload.executionId) } : {}),
    },
    reason: reasonStr,
  };
}

/**
 * Creates an ActionProposal in PENDING status with duplicate protection.
 */
async function createProposal(userId, input = {}) {
  if (!userId || typeof userId !== "string") {
    throw createError(400, "USER_ID_REQUIRED", "User ID is required to create an action proposal.");
  }

  const validated = validateProposalInput(input);

  // Duplicate proposal protection: do not create if an active proposal already exists for this target
  const existingActive = await prisma.actionProposal.findFirst({
    where: {
      userId,
      targetExternalId: validated.targetExternalId,
      actionType: validated.actionType,
      status: { in: ["PENDING", "APPROVED", "EXECUTING"] },
    },
  });

  if (existingActive) {
    return {
      created: false,
      duplicate: true,
      proposal: existingActive,
    };
  }

  const created = await prisma.actionProposal.create({
    data: {
      userId,
      channel: validated.channel,
      actionType: validated.actionType,
      targetExternalId: validated.targetExternalId,
      targetObjectType: validated.targetObjectType,
      payload: validated.payload,
      reason: validated.reason,
      status: "PENDING",
    },
  });

  return {
    created: true,
    duplicate: false,
    proposal: created,
  };
}

/**
 * Lists ActionProposals scoped by user and optional status filter.
 */
async function listProposals(userId, filters = {}) {
  if (!userId || typeof userId !== "string") {
    throw createError(400, "USER_ID_REQUIRED", "User ID is required.");
  }

  const where = { userId };
  if (filters.status) {
    where.status = String(filters.status).toUpperCase();
  }
  if (filters.actionType) {
    where.actionType = String(filters.actionType);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  return prisma.actionProposal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Retrieves a single ActionProposal scoped strictly by user ID.
 */
async function getProposal(userId, proposalId) {
  if (!userId || typeof userId !== "string") {
    throw createError(400, "USER_ID_REQUIRED", "User ID is required.");
  }
  if (!proposalId || typeof proposalId !== "string") {
    throw createError(400, "PROPOSAL_ID_REQUIRED", "Proposal ID is required.");
  }

  const proposal = await prisma.actionProposal.findFirst({
    where: { id: proposalId, userId },
  });

  if (!proposal) {
    throw createError(404, "ACTION_PROPOSAL_NOT_FOUND", "Action proposal not found.");
  }

  return proposal;
}

/**
 * Atomically transitions an ActionProposal from PENDING to APPROVED.
 */
async function approveProposal(userId, proposalId, { decisionNote } = {}) {
  const proposal = await getProposal(userId, proposalId);

  if (proposal.status !== "PENDING") {
    throw createError(409, "PROPOSAL_STATE_CONFLICT", `Cannot approve proposal with status '${proposal.status}'. Must be 'PENDING'.`);
  }

  const cleanNote = decisionNote ? String(decisionNote).trim().slice(0, 1000) : null;

  const claim = await prisma.actionProposal.updateMany({
    where: { id: proposalId, userId, status: "PENDING" },
    data: {
      status: "APPROVED",
      decisionNote: cleanNote,
    },
  });

  if (claim.count === 0) {
    throw createError(409, "PROPOSAL_STATE_CONFLICT", "Concurrent update detected. Proposal status has changed.");
  }

  return getProposal(userId, proposalId);
}

/**
 * Atomically transitions an ActionProposal from PENDING to REJECTED.
 */
async function rejectProposal(userId, proposalId, { decisionNote } = {}) {
  const proposal = await getProposal(userId, proposalId);

  if (proposal.status !== "PENDING") {
    throw createError(409, "PROPOSAL_STATE_CONFLICT", `Cannot reject proposal with status '${proposal.status}'. Must be 'PENDING'.`);
  }

  const cleanNote = decisionNote ? String(decisionNote).trim().slice(0, 1000) : null;

  const claim = await prisma.actionProposal.updateMany({
    where: { id: proposalId, userId, status: "PENDING" },
    data: {
      status: "REJECTED",
      decisionNote: cleanNote,
    },
  });

  if (claim.count === 0) {
    throw createError(409, "PROPOSAL_STATE_CONFLICT", "Concurrent update detected. Proposal status has changed.");
  }

  return getProposal(userId, proposalId);
}

/**
 * Executes an APPROVED proposal with strict double-execution protection,
 * state capture (previousState/newState), and immutable audit logging.
 */
async function executeApprovedProposal(userId, proposalId) {
  const proposal = await getProposal(userId, proposalId);

  // Safety Gate: Must be in APPROVED status
  if (proposal.status === "PENDING") {
    throw createError(400, "PROPOSAL_NOT_APPROVED", "Proposal has not been approved yet. Human approval is required.");
  }
  if (proposal.status === "REJECTED") {
    throw createError(400, "PROPOSAL_REJECTED", "Proposal has been rejected and cannot be executed.");
  }
  if (proposal.status === "EXECUTED") {
    throw createError(400, "PROPOSAL_ALREADY_EXECUTED", "Proposal has already been executed.");
  }
  if (proposal.status === "EXECUTING") {
    throw createError(409, "PROPOSAL_ALREADY_EXECUTING", "Proposal is currently being executed by another process.");
  }
  if (proposal.status !== "APPROVED") {
    throw createError(400, "PROPOSAL_INVALID_STATE", `Proposal in state '${proposal.status}' cannot be executed.`);
  }

  // Double execution lock: Atomic claim from APPROVED -> EXECUTING
  const claim = await prisma.actionProposal.updateMany({
    where: { id: proposalId, userId, status: "APPROVED" },
    data: { status: "EXECUTING" },
  });

  if (claim.count === 0) {
    throw createError(409, "PROPOSAL_LOCK_FAILED", "Could not acquire execution lock. Proposal may be executing concurrently.");
  }

  const campaignId = proposal.targetExternalId;
  const payloadSent = { campaignId, status: "PAUSED" };
  let previousState = null;
  let newState = null;
  let apiResponse = null;

  try {
    // 1. Get Meta connection and decrypt token
    const connection = await prisma.metaConnection.findUnique({ where: { userId } });
    if (!connection) {
      throw createError(404, "META_NOT_CONNECTED", "Connect a Meta account before executing ads actions.");
    }
    if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      throw createError(401, "META_REAUTH_REQUIRED", "Meta session has expired. Reconnection required.");
    }
    if (!connection.adAccountId) {
      throw createError(400, "META_AD_ACCOUNT_REQUIRED", "Select a Meta ad account in Settings first.");
    }

    const accessToken = tokenEncryption.decryptToken(connection.accessToken);
    const targetAccountId = normalizeAdAccountId(connection.adAccountId);

    // 2. Read previous state from Meta Graph API
    try {
      const remotePrev = await metaAdsProvider.getCampaign({ accessToken, campaignId });
      if (normalizeAdAccountId(remotePrev.account_id) !== targetAccountId) {
        throw createError(403, "META_CAMPAIGN_FORBIDDEN", "Target campaign belongs to a different ad account.");
      }
      previousState = {
        id: remotePrev.id,
        name: remotePrev.name,
        objective: remotePrev.objective,
        status: remotePrev.status,
        accountId: remotePrev.account_id,
        dailyBudget: remotePrev.daily_budget,
      };
    } catch (prevErr) {
      if (prevErr.status === 403) throw prevErr;
      // If reading previous state fails, keep as null but record error in cause
      previousState = { error: prevErr.message };
    }

    // 3. Execute Mutation: PAUSE_CAMPAIGN on Meta
    apiResponse = await metaAdsProvider.pauseCampaign({ accessToken, campaignId });
    if (apiResponse?.success !== true) {
      throw createError(502, "META_CAMPAIGN_STATUS_FAILED", "Meta did not confirm the campaign pause mutation.");
    }

    // 4. Confirm new state from Meta Graph API
    try {
      const remoteNew = await metaAdsProvider.getCampaign({ accessToken, campaignId });
      newState = {
        id: remoteNew.id,
        name: remoteNew.name,
        objective: remoteNew.objective,
        status: remoteNew.status,
        accountId: remoteNew.account_id,
      };
    } catch (_) {
      newState = { status: "PAUSED", verified: false };
    }

    // 5. Update local metaCampaign record if one exists in workspace
    await prisma.metaCampaign.updateMany({
      where: { userId, externalCampaignId: campaignId },
      data: { status: "PAUSED" },
    }).catch(() => {});

    const executedAt = new Date();

    // 6. Log success audit record
    await actionAuditService.logSuccess({
      userId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetExternalId: campaignId,
      payloadSent,
      previousState,
      newState,
      apiResponse,
      executedAt,
    });

    // 7. Transition proposal: EXECUTING -> EXECUTED
    await prisma.actionProposal.update({
      where: { id: proposalId },
      data: { status: "EXECUTED", executedAt },
    });

    return {
      success: true,
      proposalId,
      campaignId,
      status: "EXECUTED",
      executedAt,
      previousState,
      newState,
    };
  } catch (err) {
    const executedAt = new Date();

    // Log failure audit record
    await actionAuditService.logFailure({
      userId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetExternalId: campaignId,
      payloadSent,
      previousState,
      newState,
      apiResponse,
      errorMessage: err.message,
      executedAt,
    }).catch((logErr) => console.error("Failed to persist ActionAuditLog failure:", logErr.message));

    // Transition proposal: EXECUTING -> FAILED
    await prisma.actionProposal.update({
      where: { id: proposalId },
      data: { status: "FAILED", executedAt },
    }).catch(() => {});

    throw err;
  }
}

module.exports = {
  WHITELIST_CHANNELS,
  WHITELIST_ACTION_TYPES,
  WHITELIST_OBJECT_TYPES,
  validateProposalInput,
  createProposal,
  listProposals,
  getProposal,
  approveProposal,
  rejectProposal,
  executeApprovedProposal,
};
