const { z } = require("zod");
const prisma = require("../config/database");
const registry = require("../workers");
const planner = require("./planner");
const { executeAgentRun, MAX_AGENT_STEPS } = require("./executor");
const { productSchema, goalSchema } = require("./schemas");
const { getActiveSubscription, canUseWorker } = require("../services/workers/executeWorker");

const planRequestSchema = z.object({
  product: productSchema,
  marketingGoal: goalSchema,
  selectedWorkers: z.array(z.string().min(1)).min(1).max(MAX_AGENT_STEPS),
});

async function createPlan({ userId, body }) {
  const request = planRequestSchema.parse(body);
  if (new Set(request.selectedWorkers).size !== request.selectedWorkers.length) {
    throw Object.assign(new Error("Select each worker only once"), { status: 400, code: "AGENT_DUPLICATE_WORKER" });
  }
  const subscription = await getActiveSubscription(userId);
  if (!subscription) throw Object.assign(new Error("An active subscription is required"), { status: 403, code: "SUBSCRIPTION_REQUIRED" });
  const selected = request.selectedWorkers.map((slug) => {
    const worker = registry.find((item) => item.slug === slug);
    if (!worker) throw Object.assign(new Error(`Unknown worker: ${slug}`), { status: 400, code: "WORKER_NOT_FOUND" });
    if (!canUseWorker(subscription, worker)) throw Object.assign(new Error(`Your package does not include ${worker.name}`), { status: 403, code: "PACKAGE_CAPABILITY_REQUIRED" });
    return worker;
  });

  const run = await prisma.agentRun.create({
    data: {
      userId,
      goal: request.marketingGoal,
      productInput: request.product,
      selectedWorkers: request.selectedWorkers,
      status: "PLANNING",
    },
  });
  try {
    const context = await prisma.marketingContext.findUnique({ where: { userId } });
    const plan = await planner.createPlan({
      product: request.product,
      goal: request.marketingGoal,
      selectedWorkers: selected.map((worker) => worker.slug),
      context,
    });
    const updated = await prisma.agentRun.update({
      where: { id: run.id },
      data: { plan, status: "AWAITING_APPROVAL" },
    });
    return updated;
  } catch (error) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: error.message } });
    throw error;
  }
}

async function runDetail(userId, runId) {
  return prisma.agentRun.findFirst({
    where: { id: runId, userId },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
        include: { executions: { orderBy: { createdAt: "asc" }, include: { result: true } } },
      },
    },
  });
}

async function startRun({ userId, runId }) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw Object.assign(new Error("Agent run not found"), { status: 404, code: "AGENT_RUN_NOT_FOUND" });
  if (run.status !== "AWAITING_APPROVAL") throw Object.assign(new Error("This Agent run is not awaiting plan approval"), { status: 409, code: "AGENT_RUN_STATE_CONFLICT" });

  const selectedWorkers = run.selectedWorkers;
  if (!run.plan?.steps?.length || run.plan.steps.length !== selectedWorkers.length || run.plan.steps.some((step) => !selectedWorkers.includes(step.workerSlug))) {
    throw Object.assign(new Error("The stored plan is not a valid plan for the selected workers"), { status: 409, code: "AGENT_INVALID_PLAN" });
  }
  const subscription = await getActiveSubscription(userId);
  if (!subscription) throw Object.assign(new Error("An active subscription is required"), { status: 403, code: "SUBSCRIPTION_REQUIRED" });
  for (const step of run.plan.steps) {
    const worker = registry.find((item) => item.slug === step.workerSlug);
    if (!worker || !selectedWorkers.includes(worker.slug) || !canUseWorker(subscription, worker)) {
      throw Object.assign(new Error("The approved plan contains a worker that is no longer available to this package"), { status: 403, code: "PACKAGE_CAPABILITY_REQUIRED" });
    }
  }

  const updated = await prisma.agentRun.updateMany({
    where: { id: runId, userId, status: "AWAITING_APPROVAL" },
    data: { status: "RUNNING", errorMessage: null },
  });
  if (!updated.count) throw Object.assign(new Error("This Agent run has already started"), { status: 409, code: "AGENT_RUN_STATE_CONFLICT" });

  setImmediate(async () => {
    try {
      await executeAgentRun(runId, userId);
    } catch (error) {
      const message = error.status && error.status < 500
        ? error.message
        : error.code === "AI_PROVIDER_NOT_CONFIGURED" || error.code === "AI_MODEL_NOT_CONFIGURED"
          ? error.message
          : "The Agent run failed while executing or evaluating a worker.";
      await prisma.$transaction([
        prisma.agentStep.updateMany({ where: { agentRunId: runId, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "FAILED", errorMessage: message, completedAt: new Date() } }),
        prisma.agentRun.update({ where: { id: runId }, data: { status: "FAILED", errorMessage: message } }),
      ]).catch(() => {});
    }
  });
  return { id: runId, status: "RUNNING" };
}

module.exports = { createPlan, runDetail, startRun, planRequestSchema };
