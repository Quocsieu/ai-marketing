const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const workers = require("../workers");
const router = express.Router();
router.use(requireAuth);
const level = { M1: 1, M2: 2, M3: 3, M4: 4 };
async function getPackage(userId) {
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
router.get("/", async (req, res, next) => {
  try {
    const sub = await getPackage(req.user.sub);
    res.json({
      success: true,
      data: workers.map(({ inputFields, ...w }) => ({
        ...w,
        available: !!sub && level[sub.package.code] >= level[w.requiredPackage],
        inputFields,
      })),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/executions", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await prisma.workerExecution.findMany({
        where: { userId: req.user.sub },
        include: { result: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/:workerSlug/execute", async (req, res, next) => {
  let execution;
  const start = Date.now();
  try {
    const worker = workers.find((w) => w.slug === req.params.workerSlug);
    if (!worker)
      return res
        .status(404)
        .json({ success: false, message: "Worker not found" });
    const sub = await getPackage(req.user.sub);
    if (!sub || level[sub.package.code] < level[worker.requiredPackage])
      return res.status(403).json({
        success: false,
        message: "Your active package does not include this worker",
        code: "PACKAGE_CAPABILITY_REQUIRED",
      });
    const input = worker.inputSchema.parse(req.body);
    const context = await prisma.marketingContext.findUnique({
      where: { userId: req.user.sub },
    });
    execution = await prisma.workerExecution.create({
      data: {
        userId: req.user.sub,
        workerSlug: worker.slug,
        input,
        status: "PENDING",
      },
    });
    const generated = await worker.execute({ context, input });
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
          durationMs: Date.now() - start,
        },
      }),
    ]);
    res.json({
      success: true,
      data: {
        execution: { ...saved[1], result: saved[0] },
        worker: { slug: worker.slug, name: worker.name },
      },
    });
  } catch (e) {
    if (execution)
      try {
        await prisma.workerExecution.update({
          where: { id: execution.id },
          data: {
            status: "FAILED",
            durationMs: Date.now() - start,
            errorMessage: e.message,
          },
        });
      } catch {}
    next(e);
  }
});
module.exports = router;
