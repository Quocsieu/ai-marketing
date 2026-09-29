const AIProvider = require("./aiProvider");
class MockProvider extends AIProvider {
  async generate({ prompt, model }) {
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
