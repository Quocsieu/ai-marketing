const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const metaOAuth = require("../services/meta/metaOAuthService");
const adsService = require("../services/ads/adsService");
const {
  campaignSpecificationSchema,
} = require("../services/ads/campaignSpecification");

const router = express.Router();

router.get("/callback", async (req, res) => {
  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  ).replace(/\/$/, "");
  try {
    await metaOAuth.finishOAuth({ query: req.query });
    res.redirect(`${frontendUrl}/settings?meta=connected`);
  } catch (error) {
    console.error("META CALLBACK ERROR:", error);

    const notice =
      error.code === "META_PERMISSION_MISSING" ? "permission" : "error";

    res.redirect(`${frontendUrl}/settings?meta=${notice}`);
  }
});

router.use(requireAuth);

router.get("/auth", async (req, res, next) => {
  try {
    const authorizationUrl = await metaOAuth.beginOAuth(req.user.sub);
    res.json({ success: true, data: { authorizationUrl } });
  } catch (error) {
    next(error);
  }
});

router.get("/status", async (req, res, next) => {
  try {
    res.json({ success: true, data: await adsService.status(req.user.sub) });
  } catch (error) {
    next(error);
  }
});

router.get("/ad-accounts", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await adsService.getAdAccounts(req.user.sub),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/pages", async (req, res, next) => {
  try {
    res.json({ success: true, data: await adsService.getPages(req.user.sub) });
  } catch (error) {
    next(error);
  }
});

router.put("/selection", async (req, res, next) => {
  try {
    const input = z
      .object({
        adAccountId: z.string().min(1).max(100).nullable().optional(),
        pageId: z
          .string()
          .regex(/^\d{1,40}$/)
          .nullable()
          .optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.adAccountId !== undefined || value.pageId !== undefined,
      );
    const data = input.parse(req.body);
    res.json({
      success: true,
      data: await adsService.selectAssets(req.user.sub, data),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/campaign-specifications", async (req, res, next) => {
  try {
    const { runId } = z
      .object({ runId: z.string().min(1).max(191) })
      .strict()
      .parse(req.body);
    res.json({
      success: true,
      data: await adsService.createCampaignSpecification(req.user.sub, runId),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/campaigns", async (req, res, next) => {
  try {
    const input = z
      .object({
        runId: z.string().min(1).max(191),
        specification: campaignSpecificationSchema,
        approved: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const data = await adsService.createCampaign(req.user.sub, input);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/ad-creatives", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(255),
      pageId: z.string().regex(/^\d{1,40}$/),
      message: z.string().trim().min(1).max(2000),
      headline: z.string().trim().min(1).max(255),
      linkUrl: z.string().url().max(2048),
      callToAction: z.enum([
        "LEARN_MORE",
        "SHOP_NOW",
        "SIGN_UP",
        "CONTACT_US",
        "DOWNLOAD",
        "BOOK_TRAVEL",
        "GET_OFFER",
        "SUBSCRIBE",
      ]),
    }).strict().parse(req.body);
    const data = await adsService.createAdCreative(req.user.sub, input);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/ad-sets", async (req, res, next) => {
  try {
    const input = z.object({
      campaignId: z.string().regex(/^\d{1,40}$/),
      name: z.string().trim().min(1).max(255),
      bidAmount: z.number().finite().positive(),
      billingEvent: z.enum([
        "IMPRESSIONS",
        "LINK_CLICKS",
        "POST_ENGAGEMENT",
        "VIDEO_VIEWS",
        "LEAD_GENERATION",
      ]),
      optimizationGoal: z.enum([
        "REACH",
        "IMPRESSIONS",
        "LINK_CLICKS",
        "LANDING_PAGE_VIEWS",
        "POST_ENGAGEMENT",
        "VIDEO_VIEWS",
        "LEAD_GENERATION",
        "OFFSITE_CONVERSIONS",
        "CONVERSATIONS",
      ]),
      targeting: z.record(z.unknown()),
      status: z.literal("PAUSED").optional(),
    }).strict().parse(req.body);
    const data = await adsService.createAdSet(req.user.sub, input);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/campaigns", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await adsService.listCampaigns(req.user.sub),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/campaigns/:id", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await adsService.getCampaign(req.user.sub, req.params.id),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/campaigns/:id/pause", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await adsService.changeCampaignStatus(
        req.user.sub,
        req.params.id,
        "PAUSED",
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/campaigns/:id/resume", async (req, res, next) => {
  try {
    const { confirm } = z
      .object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json({
      success: true,
      data: await adsService.changeCampaignStatus(
        req.user.sub,
        req.params.id,
        "ACTIVE",
        confirm,
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await adsService.disconnect(req.user.sub),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
