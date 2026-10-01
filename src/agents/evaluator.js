const { decisionSchema, decisionJsonSchema } = require("./schemas");
const aiService = require("../services/ai/aiService");

async function evaluateStep({ step, output, retryCount, remainingWorkers }) {
  const prompt = [
    "TASK: agent-evaluate",
    "Write the user-facing reason in natural Vietnamese. Keep decision enum values and worker slugs unchanged.",
    "Evaluate whether this completed marketing worker output is useful and complete enough for the approved plan.",
    "Return exactly one structured decision: CONTINUE to the next approved worker, RETRY to rerun the current worker once if the output is materially incomplete, or FINISH when no approved worker remains.",
    "Never name a next worker outside the approved remaining worker list. Do not request external actions, spending, publishing, or integrations.",
    `CURRENT STEP: ${JSON.stringify(step)}`,
    `OUTPUT: ${JSON.stringify(output).slice(0, 3500)}`,
    `RETRY COUNT: ${retryCount}`,
    `REMAINING APPROVED WORKERS: ${JSON.stringify(remainingWorkers)}`,
  ].join("\n\n");
  const result = await aiService.generate({
    task: "agent-evaluate",
    taskInput: { step, retryCount, remainingWorkers, output },
    prompt,
    outputSchema: decisionJsonSchema,
    validator: decisionSchema,
  });
  const decision = result.output;
  const expected = remainingWorkers[0] || null;
  if (decision.decision === "FINISH" && expected) {
    throw Object.assign(new Error("Evaluator attempted to finish before all approved workers ran"), { status: 502, code: "AGENT_INVALID_DECISION" });
  }
  if (decision.decision === "CONTINUE" && (!expected || decision.nextWorkerSlug !== expected)) {
    throw Object.assign(new Error("Evaluator selected a worker outside the approved plan order"), { status: 502, code: "AGENT_INVALID_DECISION" });
  }
  if (decision.decision === "RETRY" && decision.nextWorkerSlug !== null) {
    throw Object.assign(new Error("Evaluator returned an invalid retry decision"), { status: 502, code: "AGENT_INVALID_DECISION" });
  }
  return decision;
}

module.exports = { evaluateStep };
