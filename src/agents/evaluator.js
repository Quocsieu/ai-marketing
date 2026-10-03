const { decisionSchema, decisionJsonSchema } = require("./schemas");
const aiService = require("../services/ai/aiService");

async function evaluateStep({
  step,
  output,
  retryCount,
  remainingWorkers,
  workerInstructions,
  evaluationCriteria,
}) {
  const hasWorkerCriteria =
    Array.isArray(evaluationCriteria) && evaluationCriteria.length > 0;
  const prompt = [
    "TASK: agent-evaluate",
    "Write the user-facing reason in natural Vietnamese. Keep decision enum values and worker slugs unchanged.",
    hasWorkerCriteria
      ? "Evaluate this worker output against the named worker's instructions and evaluation criteria below. RETRY only if one or more important criteria are materially unmet; name each unmet criterion and the missing content in the reason. If the output meets the important criteria, choose CONTINUE or FINISH even if it could be longer or more polished."
      : "Evaluate whether this completed marketing worker output is useful and complete enough for the approved plan.",
    "Return exactly one structured decision: CONTINUE to the next approved worker, RETRY to rerun the current worker once if the output is materially incomplete, or FINISH when no approved worker remains.",
    ...(hasWorkerCriteria
      ? [
          "Do not require unavailable external research when the worker completed what it can from supplied information and labeled assumptions or missing information. Never reward invented external research, customer research, competitor facts, market data, Meta access, or website crawls.",
        ]
      : []),
    "Never name a next worker outside the approved remaining worker list. Do not request external actions, spending, publishing, or integrations.",
    `CURRENT STEP: ${JSON.stringify(step)}`,
    ...(hasWorkerCriteria
      ? [
          `WORKER INSTRUCTIONS: ${workerInstructions || "Use the worker-specific criteria as the evaluation standard."}`,
          `WORKER-SPECIFIC EVALUATION CRITERIA:\n- ${evaluationCriteria.join("\n- ")}`,
        ]
      : []),
    `OUTPUT: ${JSON.stringify(output).slice(0, 3500)}`,
    `RETRY COUNT: ${retryCount}`,
    `REMAINING APPROVED WORKERS: ${JSON.stringify(remainingWorkers)}`,
  ].join("\n\n");
  const result = await aiService.generate({
    task: "agent-evaluate",
    taskInput: {
      step,
      retryCount,
      remainingWorkers,
      output,
      ...(hasWorkerCriteria ? { workerInstructions, evaluationCriteria } : {}),
    },
    prompt,
    outputSchema: decisionJsonSchema,
    validator: decisionSchema,
  });
  const decision = result.output;
  const expected = remainingWorkers[0] || null;
  if (decision.decision === "FINISH" && expected) {
    throw Object.assign(
      new Error(
        "Evaluator attempted to finish before all approved workers ran",
      ),
      { status: 502, code: "AGENT_INVALID_DECISION" },
    );
  }
  if (
    decision.decision === "CONTINUE" &&
    (!expected || decision.nextWorkerSlug !== expected)
  ) {
    throw Object.assign(
      new Error("Evaluator selected a worker outside the approved plan order"),
      { status: 502, code: "AGENT_INVALID_DECISION" },
    );
  }
  if (decision.decision === "RETRY" && decision.nextWorkerSlug !== null) {
    throw Object.assign(
      new Error("Evaluator returned an invalid retry decision"),
      { status: 502, code: "AGENT_INVALID_DECISION" },
    );
  }
  return decision;
}

module.exports = { evaluateStep };
