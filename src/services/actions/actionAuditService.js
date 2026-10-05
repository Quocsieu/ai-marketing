const prisma = require("../../config/database");

/**
 * Sanitizes an object or string to remove sensitive credentials, tokens, and authorization headers.
 */
function sanitizeSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Mask potential token strings
    return data
      .replace(/(?:EAAB|EAAQ|EAAG)[a-zA-Z0-9_-]+/g, "[REDACTED_META_TOKEN]")
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeSensitiveData(item));
  }
  if (typeof data === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("authorization") ||
        lower.includes("key")
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeSensitiveData(value);
      }
    }
    return sanitized;
  }
  return data;
}

/**
 * Persists an immutable audit log entry for a successful action execution.
 */
async function logSuccess({
  userId,
  channel = "meta",
  actionType = "PAUSE_CAMPAIGN",
  targetExternalId,
  payloadSent,
  previousState = null,
  newState = null,
  apiResponse = null,
  executedAt = new Date(),
}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required for ActionAuditLog");
  }
  if (!targetExternalId || typeof targetExternalId !== "string") {
    throw new Error("targetExternalId is required for ActionAuditLog");
  }

  const record = {
    userId,
    channel,
    actionType,
    targetExternalId,
    payloadSent: sanitizeSensitiveData(payloadSent) || {},
    previousState: sanitizeSensitiveData(previousState),
    newState: sanitizeSensitiveData(newState),
    apiResponse: sanitizeSensitiveData(apiResponse),
    status: "SUCCESS",
    errorMessage: null,
    executedAt: executedAt instanceof Date ? executedAt : new Date(executedAt),
  };

  return prisma.actionAuditLog.create({ data: record });
}

/**
 * Persists an immutable audit log entry for a failed action execution.
 */
async function logFailure({
  userId,
  channel = "meta",
  actionType = "PAUSE_CAMPAIGN",
  targetExternalId,
  payloadSent,
  previousState = null,
  newState = null,
  apiResponse = null,
  errorMessage,
  executedAt = new Date(),
}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required for ActionAuditLog");
  }
  if (!targetExternalId || typeof targetExternalId !== "string") {
    throw new Error("targetExternalId is required for ActionAuditLog");
  }

  const record = {
    userId,
    channel,
    actionType,
    targetExternalId,
    payloadSent: sanitizeSensitiveData(payloadSent) || {},
    previousState: sanitizeSensitiveData(previousState),
    newState: sanitizeSensitiveData(newState),
    apiResponse: sanitizeSensitiveData(apiResponse),
    status: "FAILED",
    errorMessage: typeof errorMessage === "string" ? sanitizeSensitiveData(errorMessage).slice(0, 5000) : "Action execution failed",
    executedAt: executedAt instanceof Date ? executedAt : new Date(executedAt),
  };

  return prisma.actionAuditLog.create({ data: record });
}

module.exports = {
  sanitizeSensitiveData,
  logSuccess,
  logFailure,
};
