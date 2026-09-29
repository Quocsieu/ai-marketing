const express = require("express");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await prisma.package.findMany({ orderBy: { priceVnd: "asc" } }),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/subscription", async (req, res, next) => {
  try {
    const data = await prisma.subscription.findFirst({
      where: {
        userId: req.user.sub,
        status: "ACTIVE",
        OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
      },
      include: { package: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
router.post("/subscription", async (req, res, next) => {
  if (process.env.NODE_ENV === "production")
    return res.status(404).json({ success: false, message: "Route not found" });
  try {
    const pkg = await prisma.package.findUnique({
      where: { code: req.body.packageCode },
    });
    if (!pkg)
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });
    await prisma.subscription.updateMany({
      where: { userId: req.user.sub, status: "ACTIVE" },
      data: { status: "INACTIVE", endDate: new Date() },
    });
    const data = await prisma.subscription.create({
      data: { userId: req.user.sub, packageId: pkg.id },
      include: { package: true },
    });
    res
      .status(201)
      .json({
        success: true,
        data,
        note: "Development package activation; no payment was processed.",
      });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
