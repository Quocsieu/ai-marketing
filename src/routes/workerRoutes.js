const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const workers = require("../workers");
const { executeWorker, getActiveSubscription, canUseWorker } = require("../services/workers/executeWorker");
const router = express.Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    const sub = await getActiveSubscription(req.user.sub);
    res.json({
      success: true,
      data: workers.map(({ inputFields, ...w }) => ({
        ...w,
        available: canUseWorker(sub, w),
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
  try {
    const result = await executeWorker({
      userId: req.user.sub,
      workerSlug: req.params.workerSlug,
      input: req.body,
    });
    res.json({
      success: true,
      data: {
        execution: result.execution,
        worker: { slug: result.worker.slug, name: result.worker.name },
      },
    });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
