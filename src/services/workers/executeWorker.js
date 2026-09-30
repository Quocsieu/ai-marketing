const prisma = require("../../config/database");
const workers = require("../../workers");

const packageLevel = { M1: 1, M2: 2, M3: 3, M4: 4 };

async function getActiveSubscription(userId) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
    },
    include: { package: true },
    orderBy: { createdAt: "desc" },
  });
}

function canUseWorker(subscription, worker) {
  return Boolean(
    subscription &&
      packageLevel[subscription.package.code] &&
      packageLevel[worker.requiredPackage] &&
      packageLevel[subscription.package.code] >= packageLevel[worker.requiredPackage],
  );
}

async function executeWorker({ userId, workerSlug, input: rawInput, agentContext, agentStepId }) {
  const worker = workers.find((item) => item.slug === workerSlug);
  if (!worker) throw Object.assign(new Error("Worker not found"), { status: 404, code: "WORKER_NOT_FOUND" });

  const subscription = await getActiveSubscription(userId);
  if (!canUseWorker(subscription, worker)) {
    throw Object.assign(new Error("Your active package does not include this worker"), {
      status: 403,
      code: "PACKAGE_CAPABILITY_REQUIRED",
    });
  }

  const input = worker.inputSchema.parse(rawInput);
  const context = await prisma.marketingContext.findUnique({ where: { userId } });
  const startedAt = Date.now();
  const execution = await prisma.workerExecution.create({
    data: { userId, workerSlug: worker.slug, input, status: "PENDING", agentStepId },
  });

  try {
    const generated = await worker.execute({ context, input, agentContext });
    const saved = await prisma.$transaction([
      prisma.workerResult.create({
        data: { executionId: execution.id, output: generated.output },
      }),
      prisma.workerExecution.update({
        where: { id: execution.id },
        data: {
          status: "SUCCEEDED",
          provider: generated.provider,
          model: generated.model,
          durationMs: Date.now() - startedAt,
        },
      }),
    ]);
    return { worker, execution: { ...saved[1], result: saved[0] }, output: generated.output };
  } catch (error) {
    await prisma.workerExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        errorMessage: error.message,
      },
    });
    error.executionId = execution.id;
    throw error;
  }
}

module.exports = { executeWorker, getActiveSubscription, canUseWorker, packageLevel };
