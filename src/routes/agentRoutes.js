const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createPlan, runDetail, startRun } = require("../agents/marketingAgent");
const prisma = require("../config/database");

const router = express.Router();
router.use(requireAuth);

router.post("/plan", async (req, res, next) => {
  try {
    const data = await createPlan({ userId: req.user.sub, body: req.body });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/run", async (req, res, next) => {
  try {
    const { runId } = req.body;
    if (typeof runId !== "string" || !runId) return res.status(400).json({ success: false, message: "runId is required" });
    const data = await startRun({ userId: req.user.sub, runId });
    res.status(202).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/runs", async (req, res, next) => {
  try {
    const data = await prisma.agentRun.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, goal: true, productInput: true, selectedWorkers: true, plan: true, status: true, errorMessage: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/runs/:id", async (req, res, next) => {
  try {
    const data = await runDetail(req.user.sub, req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Agent run not found" });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
