const { planSchema, planJsonSchema } = require("./schemas");
const aiService = require("../services/ai/aiService");
const workers = require("../workers");

function safeContext(context) {
  if (!context) return "No saved Marketing Context.";
  const { id, userId, createdAt, updatedAt, ...businessContext } = context;
  return JSON.stringify(businessContext).slice(0, 2500);
}

async function createPlan({ product, goal, selectedWorkers, context }) {
  const workerDetails = selectedWorkers.map((slug) => {
    const worker = workers.find((candidate) => candidate.slug === slug);
    return { slug: worker.slug, name: worker.name, description: worker.description, instructions: worker.instructions };
  });
  const prompt = [
    "TASK: agent-planner",
    "Write all user-facing content, including step reasons and reorderExplanation, in natural Vietnamese. Keep worker slugs and schema field names unchanged.",
    "Create an execution plan using only the selected workers below. Order steps by useful dependencies. Return structured JSON matching the supplied schema.",
    "If you change the user's selected order, set orderChanged=true and clearly explain the reason. Each step needs a concise reason and dependencies listed by worker slug. A dependency must appear earlier in the plan.",
    `PRODUCT: ${JSON.stringify(product).slice(0, 8000)}`,
    `MARKETING GOAL: ${JSON.stringify(goal)}`,
    `SAVED MARKETING CONTEXT: ${safeContext(context)}`,
    `USER SELECTED WORKER ORDER: ${selectedWorkers.join(", ")}`,
    `AVAILABLE WORKER DEFINITIONS: ${JSON.stringify(workerDetails)}`,
  ].join("\n\n");
  const generated = await aiService.generate({
    task: "agent-plan",
    taskInput: { goal: goal.objective, selectedWorkers: workerDetails },
    prompt,
    outputSchema: planJsonSchema,
    validator: planSchema,
  });

  const selectedSet = new Set(selectedWorkers);
  const planned = generated.output.steps;
  const plannedSlugs = planned.map((step) => step.workerSlug);
  if (planned.length !== selectedWorkers.length || new Set(plannedSlugs).size !== planned.length || plannedSlugs.some((slug) => !selectedSet.has(slug))) {
    throw Object.assign(new Error("Planner returned workers outside the approved selection"), { status: 502, code: "AGENT_INVALID_PLAN" });
  }
  const seen = new Set();
  for (const step of planned) {
    if (step.dependsOn.some((slug) => !seen.has(slug))) {
      throw Object.assign(new Error("Planner returned a dependency that is not earlier in the plan"), { status: 502, code: "AGENT_INVALID_PLAN" });
    }
    seen.add(step.workerSlug);
  }

  const orderChanged = plannedSlugs.some((slug, index) => slug !== selectedWorkers[index]);
  return {
    goal: goal.objective,
    steps: planned.map((step, index) => ({ ...step, order: index + 1 })),
    orderChanged,
    reorderExplanation: orderChanged
      ? generated.output.reorderExplanation || "The order was changed so foundational research can inform later campaign work."
      : "The selected order is suitable for the requested work.",
  };
}

module.exports = { createPlan };
