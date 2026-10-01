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
const workerConfigs = {
  "marketing-planner": {
    instructions:
      "Build a practical and concise marketing plan around the stated marketing objective. Set strategic priorities, target-audience direction, channel priorities, execution priorities, and measurable considerations. Provide 5–7 recommendations maximum. Keep each recommendation concise and actionable. Avoid repeating the same strategy across multiple recommendations. Prioritize the most important actions instead of writing a long report. Ground recommendations in supplied business context; label assumptions and never invent market data.",
    evaluationCriteria: [
      "The plan directly supports the stated marketing objective.",
      "Strategic priorities and practical execution actions are clear.",
      "Audience and channel direction are reasonable for the supplied context.",
      "At least one practical measurement consideration is included when relevant, without requiring a long measurement section or fabricated benchmarks or market data.",
    ],
  },

  "customer-persona": {
    instructions:
      "Describe a clear target customer persona using only supplied product, audience, and business context. Cover needs, motivations, pain points, buying concerns, behavioral insights, and messaging implications. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Avoid repeating ideas or writing a long report. Distinguish supplied facts from hypotheses and never present invented customer research as evidence.",
    evaluationCriteria: [
      "A clear persona is described for the supplied product or service.",
      "Pain points, needs, motivations, and buying concerns are concrete and plausible.",
      "The persona connects to the supplied product and includes useful messaging implications.",
      "Any inferred behavior is labeled as an assumption; no unsupported customer research is claimed.",
      "The output is concise and avoids unnecessary repetition.",
    ],
  },

  "competitor-research": {
    instructions:
      "Analyze only competitors and competitor information explicitly supplied by the user or business context. Cover known competitors, supplied strengths and weaknesses, differentiation opportunities, and potential gaps. If competitor evidence is missing, state that clearly and provide a research plan or conditional hypotheses. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Never invent competitor names, facts, pricing, market share, or research findings.",
    evaluationCriteria: [
      "Analysis is grounded in competitor data actually supplied.",
      "Where evidence exists, strengths and weaknesses are identified.",
      "At least one relevant differentiation opportunity or potential gap is described.",
      "Missing competitor data is stated plainly.",
      "No competitor names, market share, pricing, findings, or external facts are fabricated.",
      "The output is concise and avoids unnecessary repetition.",
    ],
  },

  "usp-offer": {
    instructions:
      "Identify a specific unique selling point from supplied product facts and explain its customer benefit and differentiation. Propose a concrete offer or promotion idea and explain why it may fit the stated target customer. Connect both USP and offer to the marketing objective. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Never invent product facts, prices, discounts, customer research, competitor data, or market claims. Label assumptions and missing information.",
    evaluationCriteria: [
      "At least one specific USP is stated and its customer benefit is explained.",
      "At least one concrete offer or promotion idea is proposed without inventing a price or discount.",
      "The rationale connects the offer to the supplied or clearly assumed target audience.",
      "The USP and offer are connected to the stated marketing objective.",
      "Assumptions and missing information are identified.",
      "Product, customer, competitor, and market facts are not fabricated.",
    ],
  },

  "facebook-campaign": {
    instructions:
      "Create a practical and concise Facebook campaign recommendation, not an actual campaign. Define the campaign objective, audience direction, campaign angle, campaign structure, budget considerations, and optimization considerations. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Avoid repeating the same strategy and do not write a long-form report. For budget, explain how to consider or allocate budget without inventing a specific budget amount. Use only supplied information, label assumptions, and never claim access to Meta Ads or real campaign data.",
    evaluationCriteria: [
      "The campaign objective and audience direction are clear.",
      "The campaign angle fits the supplied product and goal.",
      "A practical campaign structure, budget consideration, and optimization consideration are included.",
      "The output is concise and does not repeat the same strategy unnecessarily.",
      "No specific budget amount is invented without supplied data.",
      "No access to Meta Ads or real campaign performance data is claimed.",
    ],
  },

  "ad-copy-headline": {
    instructions:
      "Write concise headline and ad-copy options for the supplied audience. Include a clear primary message, customer benefit, call to action, and meaningful message variations. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Avoid repeating the same message. Ground copy in supplied USP and offer information. Do not invent claims, guarantees, prices, discounts, or performance results.",
    evaluationCriteria: [
      "Headline and copy options suit the supplied or clearly stated target audience.",
      "Messaging uses supplied USP or offer information and states a clear customer benefit.",
      "A relevant CTA and distinct message variations are present.",
      "The output is concise and contains meaningful variations.",
      "No unsupported product claims, guarantees, prices, or performance claims are made.",
    ],
  },

  "content-planner": {
    instructions:
      "Create a practical and concise content plan with content pillars, specific topics, suitable formats, audience intent, publishing priorities, and CTA direction. Align the plan with the supplied audience and marketing goal. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Avoid repeating the same content idea. Do not write a long-form report. Do not claim external analytics or audience data access; label assumptions where information is missing.",
    evaluationCriteria: [
      "Content pillars and specific content topics are present.",
      "Formats and audience intent are identified for the proposed content.",
      "The plan fits the supplied audience and marketing goal.",
      "Publishing priorities and CTA direction are included.",
      "The output is concise and avoids unnecessary repetition.",
      "No external analytics or unsupported audience data is claimed.",
    ],
  },

  "seo-audit-ceo-summary": {
    instructions:
      "Provide a concise executive-level SEO assessment focused on opportunities, obvious risks, content and search priorities, business implications, and actionable executive recommendations. Provide 5–6 recommendations maximum. Keep each recommendation concise and actionable. Avoid writing a long-form report. Use only supplied website or SEO evidence. If no website data is supplied, clearly state that a crawl or audit was not performed and frame recommendations as preliminary opportunities or checks, not findings.",
    evaluationCriteria: [
      "SEO opportunities and risks or issues are clearly identified, with evidence limits respected.",
      "Priorities connect search or content actions to business implications.",
      "An actionable executive-level summary and recommendations are present.",
      "The output is concise and avoids unnecessary repetition.",
      "The output does not claim a website crawl or audit without supplied website data.",
    ],
  },
};
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
    instructions: workerConfigs[workerSlug]?.instructions || `Act as a practical marketing specialist for ${name}. Provide specific, realistic, clearly labeled recommendations. Never claim access to external advertising, analytics, or competitor systems; use only supplied information and label assumptions.`,
    ...(workerConfigs[workerSlug]
      ? { evaluationCriteria: workerConfigs[workerSlug].evaluationCriteria }
      : {}),
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
