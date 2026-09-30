const m1 = [
  "Marketing Planner",
  "Customer Persona",
  "Competitor Research",
  "USP & Offer",
  "Facebook Campaign",
  "Ad Copy & Headline",
  "Content Planner",
  "SEO Audit & CEO Summary",
  "Creative Brief",
  "Marketing Context Setup",
];
const m2 = [
  "Google Search & Keyword",
  "Negative Keyword",
  "Landing Page Wireframe",
  "TikTok & Reels Script",
  "SEO Topic Cluster",
  "Retargeting & A/B Testing",
  "Analytics & CEO Dashboard",
  "UGC Script",
  "Content Repurpose",
  "On-page & Internal Link",
  "Search Ad Copy",
  "Target & Lookalike",
  "CRO Copywriter",
  "Marketing Alert",
  "Search Console",
];
const m3 = [
  "Google Shopping & Feed",
  "Full Ads Copilot",
  "Content Repurpose 10x",
  "SEO & Website CRO",
  "CAC / ROAS / Funnel Analytics",
  "Monthly CEO Strategy Report",
  "Marketing Automation",
  "Long-form Article",
  "Email & Newsletter",
  "Performance Max",
  "Quality Score",
  "Facebook & Google Audits",
  "Smart Budget Allocation",
  "Funnel Drop-off Analyst",
  "Advanced Budget Planner",
  "Creative Tester",
  "Advanced Targeting",
  "Advanced On-page Audit",
  "Website / Landing Page / CRM Data Sync",
];
const m4 = [
  "Custom Worker",
  "Custom Workflow",
  "Enterprise Marketing Context",
  "ERP Integration",
  "CRM Integration",
  "CDP Integration",
  "Website Integration",
  "Multi-level Approval Gate",
  "Private AI Infrastructure",
  "Custom AI Agent",
  "Internal Data Extraction",
  "Real-time Reporting",
  "Multi-brand Support",
  "P&L Marketing Reporting",
  "Crisis Communication",
  "Multi-language Content",
  "Brand Compliance Guard",
  "Role-based Access",
  "Prompt History",
  "Data Backup/Restore",
  "AI Voicebot",
  "Omnichannel Workflow",
  "Inventory Synchronization",
  "Livestream Script",
  "Competitor Research Workflow",
  "Prompt/Template Library",
  "AI Worker KPI Tracking",
];
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\s*\/\s*/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const records = [
  ...m1.map((name, i) => [
    name,
    slug(name),
    "M1",
    i < 3 ? "Strategy" : "Creation",
  ]),
  ...m2.map((n) => [n, slug(n), "M2", "Growth"]),
  ...m3.map((n) => [n, slug(n), "M3", "Advanced"]),
  ...m4.map((n) => [n, slug(n), "M4", "Enterprise"]),
];
module.exports = records.map(
  ([name, workerSlug, requiredPackage, category]) => ({
    name,
    slug: workerSlug,
    requiredPackage,
    category,
    description: `Generate structured ${name.toLowerCase()} recommendations using your business context.`,
    instructions: `Act as a practical marketing specialist for ${name}. Provide specific, realistic, clearly labeled recommendations. Never claim access to external advertising, analytics, or competitor systems; use only supplied information and label assumptions.`,
    inputFields: [
      {
        name: "objective",
        label: "Objective or brief",
        type: "textarea",
        required: true,
      },
      {
        name: "audience",
        label: "Audience (optional)",
        type: "text",
        required: false,
      },
      {
        name: "constraints",
        label: "Constraints (optional)",
        type: "textarea",
        required: false,
      },
    ],
    outputSchema: {
      type: "object",
      required: ["summary", "recommendations", "assumptions"],
      properties: {
        summary: { type: "string" },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "detail", "priority"],
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
          },
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
  }),
);
