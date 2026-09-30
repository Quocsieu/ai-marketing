class GeminiProvider {
  constructor() {
    this.clientPromise = null;
  }

  async client() {
    if (!process.env.GEMINI_API_KEY) {
      throw Object.assign(
        new Error("Gemini is selected but GEMINI_API_KEY is not configured"),
        {
          status: 503,
          code: "AI_PROVIDER_NOT_CONFIGURED",
        },
      );
    }
    if (!this.clientPromise) {
      this.clientPromise = import("@google/genai").then(
        ({ GoogleGenAI }) =>
          new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
      );
    }
    return this.clientPromise;
  }

  async generate({ prompt, model, outputSchema }) {
    if (!model) {
      throw Object.assign(new Error("AI_MODEL must be configured for Gemini"), {
        status: 503,
        code: "AI_MODEL_NOT_CONFIGURED",
      });
    }
    try {
      const ai = await this.client();
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: outputSchema,
          maxOutputTokens: 4096,
          httpOptions: { timeout: 45000, headers: {} },
        },
      });
      if (!response.text) {
        throw Object.assign(
          new Error("Gemini returned no structured response"),
          {
            status: 502,
            code: "AI_EMPTY_RESPONSE",
          },
        );
      }
      return { model, output: response.text };
    } catch (error) {
      if (error.status && error.code) throw error;
      throw Object.assign(new Error("Gemini request failed"), {
        status: 502,
        code: "AI_PROVIDER_ERROR",
        cause: error,
      });
    }
  }
}

module.exports = GeminiProvider;
