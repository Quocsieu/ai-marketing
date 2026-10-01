const { z } = require("zod");

const OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
];
const SPECIAL_AD_CATEGORIES = ["CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING"];

const campaignSpecificationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  objective: z.enum(OBJECTIVES),
  dailyBudget: z.number().finite().positive().max(1_000_000_000).nullable(),
  currency: z.string().trim().length(3).regex(/^[A-Z]{3}$/),
  specialAdCategories: z.array(z.enum(SPECIAL_AD_CATEGORIES)).max(5),
  audience: z.object({
    ageMin: z.number().int().min(18).max(65),
    ageMax: z.number().int().min(18).max(65),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(20),
    customerDescription: z.string().max(1000),
  }).strict(),
  creative: z.object({
    primaryText: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    description: z.string().max(1000),
    imageUrl: z.string().url().nullable(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.audience.ageMin > value.audience.ageMax) {
    context.addIssue({ code: "custom", path: ["audience", "ageMax"], message: "Maximum age must not be below minimum age." });
  }
});

function inferObjective(goal) {
  const text = String(goal || "").toLowerCase();
  if (/lead|khách hàng tiềm năng|đăng ký|để lại thông tin/.test(text)) return "OUTCOME_LEADS";
  if (/doanh số|bán hàng|mua hàng|chuyển đổi|sales|conversion/.test(text)) return "OUTCOME_SALES";
  if (/tương tác|engagement|bình luận|lượt thích/.test(text)) return "OUTCOME_ENGAGEMENT";
  if (/nhận diện|awareness|độ phủ|thương hiệu/.test(text)) return "OUTCOME_AWARENESS";
  return "OUTCOME_TRAFFIC";
}

function parseBudget(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/\s*(VND|VNĐ|USD|EUR|GBP)\s*/gi, "");
  if (/^\d+(?:[.,]\d{3})+$/.test(raw)) {
    const parsed = Number(raw.replace(/[.,]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function buildCampaignSpecification({ run, context, connection }) {
  const result = run.finalOutput || {};
  const firstRecommendation = result.workerOutputs?.flatMap((worker) => worker.output?.recommendations || [])[0];
  const productName = String(run.productInput?.name || "Marketing campaign").trim().slice(0, 120);
  const goal = String(run.goal?.objective || "").trim();
  const summary = String(result.executiveSummary || run.productInput?.description || productName).trim().slice(0, 2000);
  const customer = String(run.productInput?.targetCustomer || context?.targetCustomer || context?.targetMarket || "Broad audience; refine before creating an ad set.").slice(0, 1000);
  return {
    name: `${productName} - ${goal || "Meta campaign"}`.slice(0, 255),
    objective: inferObjective(goal),
    dailyBudget: parseBudget(run.goal?.budget),
    currency: connection.adAccountCurrency,
    specialAdCategories: [],
    audience: {
      ageMin: 18,
      ageMax: 65,
      countries: ["VN"],
      customerDescription: customer,
    },
    creative: {
      primaryText: summary,
      headline: productName.slice(0, 255),
      description: String(firstRecommendation?.detail || goal || "").slice(0, 1000),
      imageUrl: null,
    },
  };
}

module.exports = {
  OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  campaignSpecificationSchema,
  buildCampaignSpecification,
};
