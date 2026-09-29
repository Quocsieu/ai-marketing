const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
const credentials = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});
router.post("/register", async (req, res, next) => {
  try {
    const input = credentials.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name || input.email.split("@")[0],
      },
    });
    const pkg = await prisma.package.findUnique({ where: { code: "M1" } });
    if (pkg)
      await prisma.subscription.create({
        data: { userId: user.id, packageId: pkg.id },
      });
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );
    res
      .status(201)
      .json({
        success: true,
        data: {
          token,
          user: { id: user.id, email: user.email, name: user.name },
        },
      });
  } catch (e) {
    if (e.code === "P2002") e.status = 409;
    next(e);
  }
});
router.post("/login", async (req, res, next) => {
  try {
    const input = credentials
      .pick({ email: true, password: true })
      .parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash)))
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name },
      },
    });
  } catch (e) {
    next(e);
  }
});
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
    });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
