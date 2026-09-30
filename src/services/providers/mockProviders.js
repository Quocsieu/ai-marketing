const AIProvider = require("./aiProvider");
class MockProvider extends AIProvider {
  async generate({ prompt, model, task, taskInput }) {
    if (task === "agent-plan") {
      const dependencyOrder = [
        "customer-persona", "competitor-research", "usp-offer",
        "facebook-campaign", "ad-copy-headline", "content-planner",
      ];
      const selected = taskInput.selectedWorkers;
      const ordered = [...selected].sort((a, b) => {
        const ai = dependencyOrder.indexOf(a.slug);
        const bi = dependencyOrder.indexOf(b.slug);
        return (ai < 0 ? dependencyOrder.length : ai) - (bi < 0 ? dependencyOrder.length : bi);
      });
      const steps = ordered.map((worker, index) => ({
        workerSlug: worker.slug,
        reason: index === 0 ? "Start with this foundational output so later work can use its findings." : `Use the preceding ${index} output${index === 1 ? "" : "s"} to make this ${worker.name} work more specific.`,
        order: index + 1,
        dependsOn: index ? [ordered[index - 1].slug] : [],
      }));
      const changed = ordered.some((worker, index) => worker.slug !== selected[index].slug);
      return { model, output: { goal: taskInput.goal, steps, orderChanged: changed, reorderExplanation: changed ? "The order was adjusted so audience and competitor research can inform the offer and campaign content." : "The selected order already supports the requested work." } };
    }
    if (task === "agent-evaluate") {
      const finish = taskInput.remainingWorkers.length === 0;
      return { model, output: { decision: finish ? "FINISH" : "CONTINUE", reason: finish ? "All approved workers completed successfully." : "The output is structurally valid; continue to the next approved worker.", nextWorkerSlug: finish ? null : taskInput.remainingWorkers[0] } };
    }
    if (task === "agent-final") {
      const names = taskInput.workerOutputs.map((item) => item.workerName).join(", ");
      const actions = taskInput.workerOutputs.flatMap((item) =>
        (item.output.recommendations || []).slice(0, 2).map((recommendation) => recommendation.title || recommendation.detail || "Review worker recommendation"),
      ).slice(0, 8);
      const assumptions = [...new Set(taskInput.workerOutputs.flatMap((item) => item.output.assumptions || []))].slice(0, 12);
      return { model, output: {
        executiveSummary: `Marketing work for ${taskInput.product.name} toward “${taskInput.goal.objective}” is complete. Outputs include ${names}. Review each recommendation against current business evidence before taking action.`,
        workerOutputs: taskInput.workerOutputs,
        nextActions: actions,
        assumptions,
      } };
    }
    const objective =
      prompt.match(/OBJECTIVE:\s*(.+)/)?.[1] || "improve marketing outcomes";
    return {
      model: model || "mock-model",
      output: {
        summary: `Planning guidance for ${objective}. This is a mock generated example.`,
        recommendations: [
          {
            title: "Clarify the offer",
            detail:
              "State the audience, key benefit, proof, and next action. Validate these suggestions with real customer research.",
            priority: "high",
          },
          {
            title: "Run a small learning cycle",
            detail:
              "Test one audience and one message at a time; use actual campaign results before changing spend.",
            priority: "medium",
          },
        ],
        assumptions: [
          "No external advertising or analytics data was connected.",
          "Recommendations are illustrative and should be checked against business data.",
        ],
      },
    };
  }
}
module.exports = MockProvider;
