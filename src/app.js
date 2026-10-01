const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.get("/api/health", (req, res) =>
  res.json({ success: true, data: { status: "ok" } }),
);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/packages", require("./routes/packageRoutes"));
app.use("/api/marketing-context", require("./routes/contextRoutes"));
app.use("/api/workers", require("./routes/workerRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/workflows", require("./routes/workflowRoutes"));
app.use("/api/approvals", require("./routes/approvalRoutes"));
app.use("/api/agent", require("./routes/agentRoutes"));
app.use("/api/meta", require("./routes/metaRoutes"));
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use(errorHandler);
module.exports = app;
