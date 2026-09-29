const { z } = require("zod");
const responseSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.record(z.any())),
  assumptions: z.array(z.string()),
});
module.exports = { responseSchema };
