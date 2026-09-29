const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { z } = require("zod");
const router = express.Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await prisma.approval.findMany({
        where: { userId: req.user.sub },
        include: { execution: { include: { result: true } } },
        orderBy: { createdAt: "desc" },
      }),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const { executionId } = z
      .object({ executionId: z.string() })
      .parse(req.body);
    const execution = await prisma.workerExecution.findFirst({
      where: { id: executionId, userId: req.user.sub, status: "SUCCEEDED" },
    });
    if (!execution)
      return res
        .status(404)
        .json({ success: false, message: "Completed execution not found" });
    const data = await prisma.approval.create({
      data: { userId: req.user.sub, executionId },
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
router.patch("/:id", async (req, res, next) => {
  try {
    const { status, decisionNote } = z
      .object({
        status: z.enum(["APPROVED", "REJECTED"]),
        decisionNote: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const approval = await prisma.approval.findFirst({
      where: { id: req.params.id, userId: req.user.sub, status: "PENDING" },
    });
    if (!approval)
      return res
        .status(404)
        .json({ success: false, message: "Pending approval not found" });
    const data = await prisma.approval.update({
      where: { id: approval.id },
      data: { status, decisionNote, reviewedAt: new Date() },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
