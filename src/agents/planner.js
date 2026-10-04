const { planSchema, planJsonSchema } = require("./schemas");
const aiService = require("../services/ai/aiService");
const workers = require("../workers");

const BATCH_SIZE = 8;

function safeContext(context) {
  if (!context) return "No saved Marketing Context.";
  const { id, userId, createdAt, updatedAt, ...businessContext } = context;
  return JSON.stringify(businessContext).slice(0, 2500);
}

async function planSingleBatch({
  product,
  goal,
  batchWorkers,
  context,
  batchIndex,
  totalBatches,
  previousPlannedSlugs = [],
}) {
  const workerDetails = batchWorkers.map((slug) => {
    const worker = workers.find((candidate) => candidate.slug === slug);
    return {
      slug: worker.slug,
      name: worker.name,
      description: worker.description,
      instructions: worker.instructions,
    };
  });

  const isBatch = totalBatches > 1;
  const batchIntro = isBatch
    ? `BATCH PLANNING (${batchIndex + 1} OF ${totalBatches}): You are planning an execution sequence for this batch of ${batchWorkers.length} workers.`
    : "";
  const prevContext = isBatch && previousPlannedSlugs.length > 0
    ? `PREVIOUSLY PLANNED WORKERS: ${previousPlannedSlugs.join(", ")}. Steps in this batch can optionally depend on these earlier completed workers.`
    : "";

  const prompt = [
    "TASK: agent-planner",
    "Write all user-facing content, including step reasons and reorderExplanation, in natural Vietnamese. Keep worker slugs and schema field names unchanged.",
    "Create an execution plan using ALL selected workers below. You MUST include every selected worker exactly once. You MUST NOT remove, skip, replace, or add any worker. Your job is only to determine the execution order, dependencies, and reasons for the selected workers. Return structured JSON matching the supplied schema.",
    "You may change the user's selected order when dependencies require it. Set orderChanged=true when the order changes and clearly explain the reason. Every selected worker must still appear exactly once. Each step needs a concise reason and dependencies listed by worker slug. A dependency must appear earlier in the plan.",
    batchIntro,
    prevContext,
    `PRODUCT: ${JSON.stringify(product).slice(0, 8000)}`,
    `MARKETING GOAL: ${JSON.stringify(goal)}`,
    `SAVED MARKETING CONTEXT: ${safeContext(context)}`,
    `USER SELECTED WORKER ORDER: ${batchWorkers.join(", ")}`,
    `AVAILABLE WORKER DEFINITIONS: ${JSON.stringify(workerDetails)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const generated = await aiService.generate({
    task: "agent-plan",
    taskInput: { goal: goal.objective, selectedWorkers: workerDetails },
    prompt,
    outputSchema: planJsonSchema,
    validator: planSchema,
  });

  const selectedSet = new Set(batchWorkers);
  const planned = generated.output.steps;
  const plannedSlugs = planned.map((step) => step.workerSlug);
  if (
    planned.length !== batchWorkers.length ||
    new Set(plannedSlugs).size !== planned.length ||
    plannedSlugs.some((slug) => !selectedSet.has(slug))
  ) {
    throw Object.assign(
      new Error("Planner returned workers outside the approved selection"),
      { status: 502, code: "AGENT_INVALID_PLAN" },
    );
  }

  const allowedDependencies = new Set([...previousPlannedSlugs]);
  for (const step of planned) {
    if (step.dependsOn.some((slug) => !allowedDependencies.has(slug))) {
      throw Object.assign(
        new Error(
          "Planner returned a dependency that is not earlier in the plan",
        ),
        { status: 502, code: "AGENT_INVALID_PLAN" },
      );
    }
    allowedDependencies.add(step.workerSlug);
  }

  const orderChanged = plannedSlugs.some(
    (slug, index) => slug !== batchWorkers[index],
  );

  return {
    steps: planned,
    orderChanged,
    reorderExplanation: orderChanged
      ? generated.output.reorderExplanation ||
        "Thứ tự đã được điều chỉnh để các bước nền tảng hỗ trợ các bước tiếp theo."
      : "Thứ tự đã chọn phù hợp với công việc được yêu cầu.",
  };
}

async function createPlan({ product, goal, selectedWorkers, context }) {
  if (!selectedWorkers || !selectedWorkers.length) {
    throw Object.assign(new Error("No workers selected for planning"), {
      status: 400,
      code: "AGENT_NO_WORKERS",
    });
  }

  if (selectedWorkers.length <= BATCH_SIZE) {
    const single = await planSingleBatch({
      product,
      goal,
      batchWorkers: selectedWorkers,
      context,
      batchIndex: 0,
      totalBatches: 1,
      previousPlannedSlugs: [],
    });
    const steps = single.steps.map((step, index) => ({
      ...step,
      order: index + 1,
    }));
    return {
      goal: goal.objective,
      steps,
      batches: [{ batchNumber: 1, workerCount: steps.length, steps }],
      orderChanged: single.orderChanged,
      reorderExplanation: single.reorderExplanation,
    };
  }

  const batches = [];
  for (let i = 0; i < selectedWorkers.length; i += BATCH_SIZE) {
    batches.push(selectedWorkers.slice(i, i + BATCH_SIZE));
  }

  const allSteps = [];
  const planBatches = [];
  const previousPlannedSlugs = [];
  let anyOrderChanged = false;
  const reorderExplanations = [];

  for (let i = 0; i < batches.length; i += 1) {
    const batchWorkers = batches[i];
    const batchResult = await planSingleBatch({
      product,
      goal,
      batchWorkers,
      context,
      batchIndex: i,
      totalBatches: batches.length,
      previousPlannedSlugs,
    });

    if (batchResult.orderChanged) {
      anyOrderChanged = true;
      if (batchResult.reorderExplanation) {
        reorderExplanations.push(
          `Đợt ${i + 1}: ${batchResult.reorderExplanation}`,
        );
      }
    }

    const batchStepsWithGlobalOrder = batchResult.steps.map((step) => {
      const globalOrder = allSteps.length + 1;
      const globalStep = { ...step, order: globalOrder };
      allSteps.push(globalStep);
      previousPlannedSlugs.push(step.workerSlug);
      return globalStep;
    });

    planBatches.push({
      batchNumber: i + 1,
      workerCount: batchWorkers.length,
      steps: batchStepsWithGlobalOrder,
    });
  }

  return {
    goal: goal.objective,
    steps: allSteps,
    batches: planBatches,
    orderChanged: anyOrderChanged,
    reorderExplanation: anyOrderChanged
      ? reorderExplanations.join(" | ") ||
        "Thứ tự các Worker đã được tối ưu theo từng đợt để kết quả nền tảng hỗ trợ các bước tiếp theo."
      : "Thứ tự đã chọn phù hợp với công việc được yêu cầu.",
  };
}

module.exports = { createPlan, BATCH_SIZE };
