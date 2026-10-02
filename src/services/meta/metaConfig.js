const REQUIRED_SCOPES = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
];

function getMetaConfig() {
  const config = {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    redirectUri: process.env.META_REDIRECT_URI,
    graphVersion: process.env.META_GRAPH_API_VERSION || "v26.0",
    pixelId: process.env.META_PIXEL_ID,
    conversionEvent: process.env.META_CONVERSION_EVENT,
  };
  if (!config.appId || !config.appSecret || !config.redirectUri || !process.env.META_TOKEN_ENCRYPTION_KEY) {
    throw Object.assign(new Error("Meta Ads is not configured on the server."), {
      status: 503,
      code: "META_NOT_CONFIGURED",
    });
  }
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) {
    throw Object.assign(new Error("Meta Graph API version configuration is invalid."), {
      status: 500,
      code: "META_INVALID_API_VERSION",
    });
  }
  let redirect;
  try {
    redirect = new URL(config.redirectUri);
  } catch {
    throw Object.assign(new Error("Meta OAuth redirect URI is invalid."), {
      status: 500,
      code: "META_INVALID_REDIRECT_URI",
    });
  }
  if (process.env.NODE_ENV === "production" && redirect.protocol !== "https:") {
    throw Object.assign(new Error("Meta OAuth requires an HTTPS redirect URI in production."), {
      status: 500,
      code: "META_INVALID_REDIRECT_URI",
    });
  }
  return { ...config, scopes: REQUIRED_SCOPES };
}

module.exports = { REQUIRED_SCOPES, getMetaConfig };
