const names = [
  "Facebook Ads",
  "Google Ads",
  "TikTok Ads",
  "CRM",
  "ERP",
  "CDP",
  "Website",
];
module.exports = Object.fromEntries(
  names.map((name) => [
    name,
    {
      name,
      status: "NOT_CONFIGURED",
      async connect() {
        throw Object.assign(
          new Error(`${name} integration is not configured`),
          { status: 501, code: "INTEGRATION_NOT_CONFIGURED" },
        );
      },
      async execute() {
        throw Object.assign(
          new Error(`${name} integration is not configured`),
          { status: 501, code: "INTEGRATION_NOT_CONFIGURED" },
        );
      },
    },
  ]),
);
