const { z } = require("zod");

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(3).max(3000),
  price: z.union([z.string().max(100), z.number().nonnegative()]).optional(),
  category: z.string().max(160).optional(),
  features: z.array(z.string().max(300)).max(30).optional(),
  targetCustomer: z.string().max(1500).optional(),
  uniqueSellingPoints: z.array(z.string().max(300)).max(20).optional(),
  website: z.string().url().or(z.literal("")).optional(),
  industry: z.string().max(160).optional(),
  additionalInformation: z.string().max(3000).optional(),
});

const goalSchema = z.object({
  objective: z.string().trim().min(3).max(1500),
  budget: z.union([z.string().max(100), z.number().nonnegative()]).optional(),
  campaignPeriod: z.string().max(160).optional(),
  targetPlatforms: z.array(z.string().max(80)).max(12).optional(),
  constraints: z.string().max(2000).optional(),
});

const planSchema = z.object({
  goal: z.string(),
  steps: z.array(z.object({
    workerSlug: z.string(),
    reason: z.string(),
    order: z.number().int().positive(),
    dependsOn: z.array(z.string()),
  })).min(1).max(8),
  orderChanged: z.boolean(),
  reorderExplanation: z.string(),
});

const decisionSchema = z.object({
  decision: z.enum(["CONTINUE", "RETRY", "FINISH"]),
  reason: z.string().min(1),
  nextWorkerSlug: z.string().nullable(),
});

const finalOutputSchema = z.object({
  executiveSummary: z.string(),
  workerOutputs: z.array(z.object({ workerSlug: z.string(), workerName: z.string(), output: z.record(z.any()) })),
  nextActions: z.array(z.string()),
  assumptions: z.array(z.string()),
});

const planJsonSchema = {
  type: "object", required: ["goal", "steps", "orderChanged", "reorderExplanation"],
  properties: {
    goal: { type: "string" },
    steps: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", required: ["workerSlug", "reason", "order", "dependsOn"], properties: { workerSlug: { type: "string" }, reason: { type: "string" }, order: { type: "integer" }, dependsOn: { type: "array", items: { type: "string" } } } } },
    orderChanged: { type: "boolean" }, reorderExplanation: { type: "string" },
  },
};

const decisionJsonSchema = {
  type: "object", required: ["decision", "reason", "nextWorkerSlug"],
  properties: { decision: { type: "string", enum: ["CONTINUE", "RETRY", "FINISH"] }, reason: { type: "string" }, nextWorkerSlug: { type: ["string", "null"] } },
};

const finalOutputJsonSchema = {
  type: "object",
  required: ["executiveSummary", "workerOutputs", "nextActions", "assumptions"],
  properties: {
    executiveSummary: { type: "string" },
    workerOutputs: { type: "array", items: { type: "object", required: ["workerSlug", "workerName", "output"], properties: { workerSlug: { type: "string" }, workerName: { type: "string" }, output: { type: "object", additionalProperties: true } } } },
    nextActions: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
};

module.exports = { productSchema, goalSchema, planSchema, decisionSchema, finalOutputSchema, planJsonSchema, decisionJsonSchema, finalOutputJsonSchema };
