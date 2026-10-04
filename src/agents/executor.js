const prisma = require("../config/database");
const workerService = require("../services/workers/executeWorker");
const evaluator = require("./evaluator");
const aiService = require("../services/ai/aiService");
const { finalOutputSchema, finalOutputJsonSchema } = require("./schemas");
const workerRegistry = require("../workers");

const MAX_BATCH_STEPS = 8;
const MAX_TOTAL_STEPS = 71;
const MAX_AGENT_STEPS = MAX_BATCH_STEPS;
const MAX_RETRIES_PER_WORKER = 1;

function workerInput(product, goal, context, step) {
  const objective = [
    `Product: ${product.name}.`,
    `Description: ${product.description.slice(0, 450)}`,
    `Category: ${product.category || context?.industry || "Not provided"}. Industry: ${product.industry || context?.industry || "Not provided"}. Website: ${product.website || context?.website || "Not provided"}.`,
    `Price: ${product.price ?? context?.productPrice ?? "Not provided"}.`,
    `Features: ${
      (product.features || [])
        .slice(0, 4)
        .map((item) => item.slice(0, 100))
        .join(", ") || "Not provided"
    }.`,
    `Unique selling points: ${
      (product.uniqueSellingPoints || [])
        .slice(0, 4)
        .map((item) => item.slice(0, 100))
        .join(", ") ||
      context?.uniqueSellingPoints?.slice(0, 300) ||
      "Not provided"
    }.`,
    `Campaign objective: ${goal.objective.slice(0, 600)}.`,
    `Budget: ${goal.budget ?? "Not provided"}. Period: ${goal.campaignPeriod || "Not provided"}. Platforms: ${(goal.targetPlatforms || []).slice(0, 5).join(", ") || "Not specified"}.`,
    `Plan step: ${step.reason.slice(0, 200)}`,
  ]
    .join("\n")
    .slice(0, 1900);
  return {
    objective,
    audience: (
      product.targetCustomer ||
      context?.targetCustomer ||
      context?.targetMarket ||
      ""
    ).slice(0, 1000),
    constraints: [
      goal.constraints?.slice(0, 900),
      product.additionalInformation?.slice(0, 500),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500),
  };
}

function compactPreviousResults(results) {
  return Object.fromEntries(
    Object.entries(results)
      .slice(-2)
      .map(([slug, result]) => [
        slug,
        {
          summary: String(result.summary || "").slice(0, 200),
          recommendations: (result.recommendations || [])
            .slice(0, 2)
            .map((item) => ({
              title: String(item.title || "").slice(0, 80),
              detail: String(item.detail || "").slice(0, 160),
            })),
          assumptions: (result.assumptions || [])
            .slice(0, 2)
            .map((item) => String(item).slice(0, 120)),
        },
      ]),
  );
}

function compactAgentInput(product, goal) {
  return {
    product: {
      name: product.name,
      description: product.description.slice(0, 350),
      price: product.price,
      category: product.category,
      features: (product.features || [])
        .slice(0, 3)
        .map((item) => item.slice(0, 80)),
      targetCustomer: product.targetCustomer?.slice(0, 350),
      uniqueSellingPoints: (product.uniqueSellingPoints || [])
        .slice(0, 3)
        .map((item) => item.slice(0, 80)),
      website: product.website,
      industry: product.industry,
    },
    marketingGoal: {
      objective: goal.objective.slice(0, 500),
      budget: goal.budget,
      campaignPeriod: goal.campaignPeriod,
      targetPlatforms: (goal.targetPlatforms || []).slice(0, 5),
      constraints: goal.constraints?.slice(0, 300),
    },
  };
}

async function createFinalOutput(run, outputs) {
  console.log("FINAL: entered createFinalOutput");
  console.log("FINAL: outputs count =", outputs.length);
  const product = run.productInput;
  const goal = run.goal;
  const prompt = [
    "TASK: agent-final",
    "Write all user-facing content in natural Vietnamese. Preserve names, facts, and recommendations from the supplied worker outputs; do not translate product or brand names. Keep the required JSON structure.",
    "Synthesize a concise final marketing brief from the supplied product, goal, and completed worker outputs. Ground all statements in the provided outputs; do not invent market facts or claim external data access.",
    `PRODUCT: ${JSON.stringify(product).slice(0, 9000)}`,
    `GOAL: ${JSON.stringify(goal)}`,
    `COMPLETED WORKER OUTPUTS: ${JSON.stringify(outputs).slice(0, 12000)}`,
  ].join("\n\n");
  let result;

  try {
    console.log("FINAL: calling aiService.generate");
    result = await aiService.generate({
      task: "agent-final",
      taskInput: { product, goal, workerOutputs: outputs },
      prompt,
      outputSchema: finalOutputJsonSchema,
      validator: finalOutputSchema,
    });
  } catch (error) {
    console.error("AGENT FINAL ERROR:", error);
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("CAUSE:", error.cause?.message);
    throw error;
  }
  const generated = result.output;
  return {
    ...generated,
    workerOutputs: outputs.map((item) => {
      const matched = (generated.workerOutputs || []).find((g) => g.workerSlug === item.workerSlug);
      return matched || item;
    }),
  };
}

async function executeAgentRun(runId, userId) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run || run.status !== "RUNNING") return;
  const plan = run.plan;
  if (!plan?.steps?.length || plan.steps.length > MAX_TOTAL_STEPS) {
    throw new Error("Agent plan is empty or exceeds the configured step limit");
  }

  const product = run.productInput;
  const goal = run.goal;
  const context = await prisma.marketingContext.findUnique({
    where: { userId },
  });
  const outputs = [];
  const previousResults = {};

  const existingSteps = await prisma.agentStep.findMany({
    where: { agentRunId: runId },
    orderBy: { stepOrder: "asc" },
  });

  for (const s of existingSteps) {
    if (s.status === "SUCCEEDED" && s.output) {
      previousResults[s.workerSlug] = s.output;
      const worker = workerRegistry.find((item) => item.slug === s.workerSlug);
      outputs.push({
        workerSlug: s.workerSlug,
        workerName: worker ? worker.name : s.workerSlug,
        output: s.output,
      });
    }
  }

  const batches = plan.batches && plan.batches.length > 0
    ? plan.batches
    : [{ batchNumber: 1, steps: plan.steps }];

  for (const batch of batches) {
    if (batch.steps.length > MAX_BATCH_STEPS) {
      throw new Error(`Batch exceeds maximum step limit of ${MAX_BATCH_STEPS}`);
    }
    for (let bIndex = 0; bIndex < batch.steps.length; bIndex += 1) {
      const planStep = batch.steps[bIndex];
      const worker = workerRegistry.find(
        (item) => item.slug === planStep.workerSlug,
      );
      if (!worker)
        throw new Error(
          "A planned worker is no longer available in the registry",
        );

      const existingStep = existingSteps.find(
        (s) => s.stepOrder === planStep.order,
      );
      if (existingStep && existingStep.status === "SUCCEEDED") {
        continue;
      }

      const input = existingStep?.input || workerInput(product, goal, context, planStep);
      let step = existingStep;
      if (!step) {
        step = await prisma.agentStep.create({
          data: {
            agentRunId: runId,
            workerSlug: worker.slug,
            stepOrder: planStep.order,
            status: "PENDING",
            input,
            reason: planStep.reason,
          },
        });
      }
      let retries = 0;
      while (true) {
        await prisma.agentStep.update({
          where: { id: step.id },
          data: { status: "RUNNING", startedAt: new Date(), errorMessage: null },
        });
        let executed;
        try {
          console.log("AGENT: executing worker =", worker.slug);
          executed = await workerService.executeWorker({
            userId,
            workerSlug: worker.slug,
            input,
            agentStepId: step.id,
            agentContext: {
              ...compactAgentInput(product, goal),
              previousWorkerResults: compactPreviousResults(previousResults),
            },
          });
        } catch (error) {
          await prisma.agentStep.update({
            where: { id: step.id },
            data: {
              status: "FAILED",
              errorMessage: error.message,
              completedAt: new Date(),
            },
          });
          throw error;
        }
        const remainingWorkers = plan.steps
          .filter((item) => item.order > planStep.order)
          .map((item) => item.workerSlug);
        const decision = await evaluator.evaluateStep({
          step: {
            workerSlug: worker.slug,
            reason: planStep.reason,
            order: planStep.order,
          },
          output: executed.output,
          retryCount: retries,
          remainingWorkers,
          workerInstructions: worker.instructions,
          evaluationCriteria: worker.evaluationCriteria,
        });
        await prisma.agentStep.update({
          where: { id: step.id },
          data: {
            output: executed.output,
            decision,
            retryCount: retries,
            status: decision.decision === "RETRY" ? "PENDING" : "SUCCEEDED",
            completedAt: decision.decision === "RETRY" ? null : new Date(),
          },
        });
        if (decision.decision === "RETRY") {
          if (retries >= MAX_RETRIES_PER_WORKER) {
            throw Object.assign(
              new Error(
                `Worker ${worker.name} remained insufficient after ${MAX_RETRIES_PER_WORKER} retry`,
              ),
              { code: "AGENT_RETRY_LIMIT" },
            );
          }
          retries += 1;
          continue;
        }
        previousResults[worker.slug] = executed.output;
        outputs.push({
          workerSlug: worker.slug,
          workerName: worker.name,
          output: executed.output,
        });
        break;
      }
    }
  }

  console.log("AGENT: all workers completed");
  console.log("AGENT: generating final output...");

  const finalOutput = await createFinalOutput(run, outputs);

  console.log("AGENT: final output generated");
  console.log(finalOutput);

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "SUCCEEDED", finalOutput, errorMessage: null },
  });
}

module.exports = {
  executeAgentRun,
  MAX_AGENT_STEPS,
  MAX_BATCH_STEPS,
  MAX_TOTAL_STEPS,
  MAX_RETRIES_PER_WORKER,
};
