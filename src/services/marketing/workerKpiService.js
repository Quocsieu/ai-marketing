"use strict";

const prisma = require("../../config/database");

/**
 * Creates an Error object with HTTP status and error code.
 */
function createError(message, status = 400, code = "BAD_REQUEST") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Parses and validates a date input (string, Date, number).
 * Returns a valid Date instance or throws 400.
 */
function parseUtcDate(value, fieldName = "date") {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw createError(`Invalid ${fieldName}: '${value}' is not a valid date`, 400, "INVALID_DATE_FORMAT");
  }
  return d;
}

/**
 * Formats a Date object to YYYY-MM-DD in UTC.
 */
function formatDateIso(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Rounds a number to a given number of decimal places (default: 2).
 */
function round(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Validates and normalizes date ranges with UTC boundary enforcement.
 */
function validateDateRange(options = {}) {
  const rawFrom = options.dateFrom || options.since;
  const rawTo = options.dateTo || options.until;

  let fromDate = null;
  let toDate = null;

  if (rawFrom) {
    fromDate = parseUtcDate(rawFrom, "dateFrom/since");
    fromDate.setUTCHours(0, 0, 0, 0);
  }

  if (rawTo) {
    toDate = parseUtcDate(rawTo, "dateTo/until");
    toDate.setUTCHours(23, 59, 59, 999);
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw createError(
      `Invalid date range: dateFrom (${formatDateIso(fromDate)}) cannot be after dateTo (${formatDateIso(toDate)})`,
      400,
      "INVALID_DATE_RANGE"
    );
  }

  return { fromDate, toDate };
}

/**
 * Pure function: calculates aggregated worker KPIs from an array of worker executions.
 *
 * @param {Array<Object>} executions - Array of WorkerExecution records
 * @param {Object} [options={}] - Filter and period options
 * @returns {Object} Comprehensive worker KPI metrics
 */
function calculateWorkerKpis(executions = [], options = {}) {
  const list = Array.isArray(executions) ? executions.filter((e) => e && typeof e === "object") : [];

  let totalExecutions = 0;
  let successfulExecutions = 0;
  let failedExecutions = 0;
  let pendingExecutions = 0;

  const validDurations = [];
  const workerMap = new Map();
  const errorMap = new Map();

  for (const item of list) {
    totalExecutions++;
    const status = String(item.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      successfulExecutions++;
    } else if (status === "FAILED") {
      failedExecutions++;
    } else if (status === "PENDING") {
      pendingExecutions++;
    }

    // Duration extraction & validation
    const duration = typeof item.durationMs === "number" ? item.durationMs : null;
    if (duration !== null && Number.isFinite(duration) && duration >= 0) {
      validDurations.push(duration);
    }

    // Worker Slug breakdown
    const slug = typeof item.workerSlug === "string" && item.workerSlug.trim() ? item.workerSlug.trim() : "unknown-worker";
    if (!workerMap.has(slug)) {
      workerMap.set(slug, {
        workerSlug: slug,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        pendingExecutions: 0,
        durations: [],
      });
    }
    const wStats = workerMap.get(slug);
    wStats.totalExecutions++;
    if (status === "SUCCEEDED") wStats.successfulExecutions++;
    else if (status === "FAILED") wStats.failedExecutions++;
    else if (status === "PENDING") wStats.pendingExecutions++;

    if (duration !== null && Number.isFinite(duration) && duration >= 0) {
      wStats.durations.push(duration);
    }

    // Error aggregation (only for FAILED or items with errorMessage)
    if (item.errorMessage && typeof item.errorMessage === "string" && item.errorMessage.trim()) {
      const msg = item.errorMessage.trim();
      if (!errorMap.has(msg)) {
        errorMap.set(msg, {
          errorMessage: msg,
          count: 0,
          impactedWorkers: new Set(),
        });
      }
      const errStats = errorMap.get(msg);
      errStats.count++;
      errStats.impactedWorkers.add(slug);
    }
  }

  // Global rates & duration stats
  const successRate = totalExecutions > 0 ? round((successfulExecutions / totalExecutions) * 100, 2) : null;
  const failureRate = totalExecutions > 0 ? round((failedExecutions / totalExecutions) * 100, 2) : null;

  let minDurationMs = null;
  let maxDurationMs = null;
  let averageDurationMs = null;
  const validDurationCount = validDurations.length;

  if (validDurationCount > 0) {
    minDurationMs = Math.min(...validDurations);
    maxDurationMs = Math.max(...validDurations);
    const sum = validDurations.reduce((acc, curr) => acc + curr, 0);
    averageDurationMs = round(sum / validDurationCount, 2);
  }

  // Worker breakdown formatting and deterministic sorting:
  // Primary: totalExecutions DESC, Secondary: workerSlug ASC
  const workerBreakdown = Array.from(workerMap.values())
    .map((w) => {
      const wTotal = w.totalExecutions;
      const wSuccess = w.successfulExecutions;
      const wRate = wTotal > 0 ? round((wSuccess / wTotal) * 100, 2) : null;
      let wAvgDuration = null;
      if (w.durations.length > 0) {
        const sum = w.durations.reduce((a, b) => a + b, 0);
        wAvgDuration = round(sum / w.durations.length, 2);
      }
      return {
        workerSlug: w.workerSlug,
        totalExecutions: wTotal,
        successfulExecutions: wSuccess,
        failedExecutions: w.failedExecutions,
        pendingExecutions: w.pendingExecutions,
        successRate: wRate,
        averageDurationMs: wAvgDuration,
      };
    })
    .sort((a, b) => {
      if (b.totalExecutions !== a.totalExecutions) {
        return b.totalExecutions - a.totalExecutions;
      }
      return a.workerSlug.localeCompare(b.workerSlug);
    });

  // Top workers by execution volume
  const topWorkers = workerBreakdown.slice(0, 5);

  // Errors formatting and deterministic sorting:
  // Primary: count DESC, Secondary: errorMessage ASC
  const errors = Array.from(errorMap.values())
    .map((e) => ({
      errorMessage: e.errorMessage,
      count: e.count,
      impactedWorkers: Array.from(e.impactedWorkers).sort(),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.errorMessage.localeCompare(b.errorMessage);
    });

  return {
    period: {
      dateFrom: options.dateFrom ? formatDateIso(options.dateFrom instanceof Date ? options.dateFrom : new Date(options.dateFrom)) : null,
      dateTo: options.dateTo ? formatDateIso(options.dateTo instanceof Date ? options.dateTo : new Date(options.dateTo)) : null,
    },
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    pendingExecutions,
    successRate,
    failureRate,
    durationMetrics: {
      averageDurationMs,
      minDurationMs,
      maxDurationMs,
      validDurationCount,
    },
    topWorkers,
    workerBreakdown,
    errors,
    dataNotice:
      totalExecutions === 0
        ? "No AI worker execution telemetry recorded for this user yet. Metrics will populate once workers are executed."
        : undefined,
  };
}

/**
 * Fetches execution telemetry from database for a specific user and returns aggregated KPIs.
 *
 * @param {string} userId - User identifier for tenant isolation
 * @param {Object} [options={}] - Options including workerSlug, dateFrom, dateTo, since, until
 * @returns {Promise<Object>} Aggregated worker KPIs
 */
async function getWorkerKpis(userId, options = {}) {
  if (!userId || typeof userId !== "string") {
    throw createError("User ID is required for Worker KPI Tracking", 400, "USER_ID_REQUIRED");
  }

  const { fromDate, toDate } = validateDateRange(options);

  const whereClause = {
    userId,
  };

  if (options.workerSlug && typeof options.workerSlug === "string" && options.workerSlug.trim()) {
    whereClause.workerSlug = options.workerSlug.trim();
  }

  if (fromDate || toDate) {
    whereClause.createdAt = {};
    if (fromDate) whereClause.createdAt.gte = fromDate;
    if (toDate) whereClause.createdAt.lte = toDate;
  }

  const executions = await prisma.workerExecution.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workerSlug: true,
      status: true,
      durationMs: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return calculateWorkerKpis(executions, {
    ...options,
    dateFrom: fromDate,
    dateTo: toDate,
  });
}

module.exports = {
  createError,
  parseUtcDate,
  formatDateIso,
  round,
  validateDateRange,
  calculateWorkerKpis,
  getWorkerKpis,
};
