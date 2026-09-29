const MockProvider = require("../providers/mockProviders");
const { responseSchema } = require("../../workers/schemas");
const providers = { mock: new MockProvider() };
async function generate(request) {
  const providerName = process.env.AI_PROVIDER || "mock";
  const provider = providers[providerName];
  if (!provider)
    throw Object.assign(
      new Error(`AI provider "${providerName}" is not configured`),
      { status: 503, code: "AI_PROVIDER_UNAVAILABLE" },
    );
  const generated = await provider.generate({
    ...request,
    model: process.env.AI_MODEL || "mock-model",
  });
  const parsed = responseSchema.safeParse(generated.output);
  if (!parsed.success)
    throw Object.assign(
      new Error("AI provider returned invalid structured output"),
      { status: 502, code: "AI_VALIDATION_ERROR" },
    );
  return {
    output: parsed.data,
    provider: providerName,
    model: generated.model,
  };
}
module.exports = { generate };
