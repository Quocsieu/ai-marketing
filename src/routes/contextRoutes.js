const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { z } = require("zod");
const router = express.Router();
router.use(requireAuth);
const schema = z.object({
  businessName: z.string().min(1).max(200),
  brandDescription: z.string().max(5000).optional(),
  productService: z.string().max(5000).optional(),
  productPrice: z.string().max(100).optional(),
  targetMarket: z.string().max(2000).optional(),
  targetCustomer: z.string().max(2000).optional(),
  brandVoice: z.string().max(200).optional(),
  brandTone: z.string().max(200).optional(),
  businessGoals: z.string().max(3000).optional(),
  marketingGoals: z.string().max(3000).optional(),
  uniqueSellingPoints: z.string().max(3000).optional(),
  competitors: z.array(z.string().max(200)).optional(),
  location: z.string().max(200).optional(),
  industry: z.string().max(200).optional(),
  website: z.string().url().or(z.literal("")).optional(),
  socialMedia: z.record(z.string()).optional(),
  additionalNotes: z.string().max(5000).optional(),
});
router.get("/", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await prisma.marketingContext.findUnique({
        where: { userId: req.user.sub },
      }),
    });
  } catch (e) {
    next(e);
  }
});
router.put("/", async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const context = await prisma.marketingContext.upsert({
      where: { userId: req.user.sub },
      create: { ...data, userId: req.user.sub },
      update: data,
    });
    res.json({ success: true, data: context });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
