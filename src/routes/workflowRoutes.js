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
      data: await prisma.customWorkflow.findMany({
        where: { userId: req.user.sub },
        orderBy: { createdAt: "desc" },
      }),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        definition: z.record(z.any()),
      })
      .parse(req.body);
    const data = await prisma.customWorkflow.create({
      data: { ...input, userId: req.user.sub },
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
