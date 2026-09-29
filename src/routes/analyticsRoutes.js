const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    const [total, succeeded, failed, recent] = await Promise.all([
      prisma.workerExecution.count({ where: { userId: req.user.sub } }),
      prisma.workerExecution.count({
        where: { userId: req.user.sub, status: "SUCCEEDED" },
      }),
      prisma.workerExecution.count({
        where: { userId: req.user.sub, status: "FAILED" },
      }),
      prisma.workerExecution.findMany({
        where: { userId: req.user.sub },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          workerSlug: true,
          status: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ]);
    res.json({ success: true, data: { total, succeeded, failed, recent } });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
