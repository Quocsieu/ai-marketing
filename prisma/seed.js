require("dotenv").config();
const prisma = require("../src/config/database");
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
async function main() {
  let capabilities = [...m1, ...m2, ...m3, ...m4];
  const workers = require("../src/workers");
  for (const w of workers)
    await prisma.worker.upsert({
      where: { slug: w.slug },
      create: {
        slug: w.slug,
        name: w.name,
        category: w.category,
        requiredPackage: w.requiredPackage,
        description: w.description,
        outputSchema: w.outputSchema,
      },
      update: {
        name: w.name,
        category: w.category,
        requiredPackage: w.requiredPackage,
        description: w.description,
        outputSchema: w.outputSchema,
      },
    });
  for (const [code, name, price, desc] of [
    [
      "M1",
      "Marketing Kh?i �?ng",
      1990000,
      "Marketing foundations for small businesses",
    ],
    ["M2", "Marketing Tang Tru?ng", 2990000, "Growth marketing capabilities"],
    ["M3", "Marketing To�n Di?n", 4990000, "Advanced multi-channel marketing"],
    ["M4", "Enterprise & Brand", null, "Custom enterprise capabilities"],
  ]) {
    const allowed =
      code === "M1"
        ? m1
        : code === "M2"
          ? [...m1, ...m2]
          : code === "M3"
            ? [...m1, ...m2, ...m3]
            : capabilities;
    await prisma.package.upsert({
      where: { code },
      create: {
        code,
        name,
        priceVnd: price,
        description: desc,
        capabilities: allowed,
      },
      update: {
        name,
        priceVnd: price,
        description: desc,
        capabilities: allowed,
      },
    });
  }
}
main().finally(() => prisma.$disconnect());
