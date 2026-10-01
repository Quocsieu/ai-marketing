const { z } = require("zod");
const common = z
  .object({
    objective: z.string().min(3).max(2000),
    audience: z.string().max(1000).optional(),
    constraints: z.string().max(2000).optional(),
  })
  .strict();
const aiService = require("../services/ai/aiService");
const catalog = require("./catalog/workers");
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
module.exports = catalog.map((worker) => ({
  ...worker,
  inputSchema: common,
  async execute({ context, input, agentContext }) {
    const contextText = context
      ? Object.entries(context)
          .filter(
            ([k, v]) =>
              !["id", "userId", "createdAt", "updatedAt"].includes(k) && v,
          )
          .map(
            ([k, v]) =>
              `${k}: ${Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : v}`,
          )
          .join("\n")
      : "No marketing context provided.";
    const agentContextText = agentContext
      ? JSON.stringify(agentContext).slice(0, 5000)
      : "Manual worker execution; no Agent run context.";
    const prompt = `SYSTEM: You are a careful, practical marketing advisor. Write every user-facing output in natural Vietnamese.\nWORKER: ${worker.name}\nINSTRUCTIONS: ${worker.instructions}\nMARKETING CONTEXT:\n${contextText.slice(0, 2500)}\nAGENT PRODUCT, GOAL, AND PREVIOUS WORKER OUTPUTS (bounded context):\n${agentContextText}\nOBJECTIVE: ${input.objective}\nAUDIENCE: ${input.audience || "Not specified"}\nCONSTRAINTS: ${input.constraints || "Not specified"}\nReturn JSON with summary (string), recommendations (array of objects), assumptions (array of strings). Keep JSON field names and technical enum values unchanged.`;
    return aiService.generate({ prompt, outputSchema: worker.outputSchema });
  },
}));
