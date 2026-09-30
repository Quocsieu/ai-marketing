const MockProvider = require("../providers/mockProviders");
const GeminiProvider = require("../providers/geminiProvider");
const { responseSchema } = require("../../workers/schemas");
const providers = { mock: new MockProvider(), gemini: new GeminiProvider() };
async function generate(request) {
  const providerName = process.env.AI_PROVIDER || "mock";
  const provider = providers[providerName];
  if (!provider)
    throw Object.assign(
      new Error(`AI provider "${providerName}" is not configured`),
      { status: 503, code: "AI_PROVIDER_UNAVAILABLE" },
    );
  try {
    const generated = await provider.generate({
      ...request,
      outputSchema: request.outputSchema || {
        type: "object",
        required: ["summary", "recommendations", "assumptions"],
        properties: {
          summary: { type: "string" },
          recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, priority: { type: "string" } }, required: ["title", "detail", "priority"] } },
          assumptions: { type: "array", items: { type: "string" } },
        },
      },
      model: process.env.AI_MODEL || (providerName === "mock" ? "mock-model" : undefined),
    });
    let output = generated.output;
    if (typeof output === "string") {
      try { output = JSON.parse(output); }
      catch { throw Object.assign(new Error("AI provider returned invalid JSON"), { status: 502, code: "AI_INVALID_JSON" }); }
    }
    const validator = request.validator || responseSchema;
    const parsed = validator.safeParse(output);
    if (!parsed.success)
      throw Object.assign(new Error("AI provider returned invalid structured output"), {
        status: 502,
        code: "AI_VALIDATION_ERROR",
      });
    return {
      output: parsed.data,
      provider: providerName,
      model: generated.model || process.env.AI_MODEL,
    };
  } catch (error) {
    if (error.status && error.code) throw error;
    throw Object.assign(
      new Error("AI generation failed"),
      { status: 502, code: "AI_PROVIDER_ERROR", cause: error },
    );
  }
}
module.exports = { generate };
