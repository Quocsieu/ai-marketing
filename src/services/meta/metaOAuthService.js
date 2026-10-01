const crypto = require("node:crypto");
const prisma = require("../../config/database");
const { getMetaConfig } = require("./metaConfig");
const { encryptToken } = require("./tokenEncryption");
const { MetaAdsProvider } = require("./metaAdsProvider");

const metaAdsProvider = new MetaAdsProvider();

function stateDigest(state) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

async function beginOAuth(userId) {
  const config = getMetaConfig();
  const state = crypto.randomBytes(32).toString("base64url");
  await prisma.metaOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.metaOAuthState.create({
    data: { stateHash: stateDigest(state), userId, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const authorization = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  authorization.search = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(","),
    state,
    config_id: "1108945901669638",
  }).toString();
  console.log("META AUTH URL:", authorization.toString());
  return authorization.toString();
}

async function consumeState(state) {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(state)) {
    throw Object.assign(new Error("Meta OAuth state is invalid or expired."), {
      status: 400,
      code: "META_INVALID_STATE",
    });
  }
  const where = { stateHash: stateDigest(state), expiresAt: { gt: new Date() } };
  const stateRecord = await prisma.metaOAuthState.findFirst({ where });
  if (!stateRecord) {
    throw Object.assign(new Error("Meta OAuth state is invalid, expired, or already used."), {
      status: 400,
      code: "META_INVALID_STATE",
    });
  }
  const result = await prisma.metaOAuthState.deleteMany({ where: { ...where, id: stateRecord.id } });
  if (result.count !== 1) {
    throw Object.assign(new Error("Meta OAuth state is invalid, expired, or already used."), {
      status: 400,
      code: "META_INVALID_STATE",
    });
  }
  return stateRecord.userId;
}

async function exchangeAuthorizationCode(code, config) {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  }).toString();
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    console.error("Meta OAuth token exchange transport error", { error: error.name });
    throw Object.assign(new Error("Meta could not complete OAuth. Please connect again."), {
      status: 502,
      code: "META_OAUTH_EXCHANGE_FAILED",
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
    console.error("Meta OAuth token exchange failed", { metaCode: body.error?.code || null });
    throw Object.assign(new Error("Meta could not complete OAuth. Please connect again."), {
      status: 502,
      code: "META_OAUTH_EXCHANGE_FAILED",
    });
  }
  return body;
}

async function exchangeLongLivedToken(shortToken, config) {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortToken,
  }).toString();
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    console.error("Meta long-lived token exchange transport error", { error: error.name });
    throw Object.assign(new Error("Meta could not secure the account session. Please connect again."), {
      status: 502,
      code: "META_TOKEN_EXTENSION_FAILED",
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
    console.error("Meta long-lived token exchange failed", { metaCode: body.error?.code || null });
    throw Object.assign(new Error("Meta could not secure the account session. Please connect again."), {
      status: 502,
      code: "META_TOKEN_EXTENSION_FAILED",
    });
  }
  return body;
}

async function finishOAuth({ query }) {
  const config = getMetaConfig();
  const userId = await consumeState(query.state);
  if (!userId) {
    throw Object.assign(new Error("Meta OAuth state is invalid or expired."), {
      status: 400,
      code: "META_INVALID_STATE",
    });
  }
  if (query.error || typeof query.code !== "string" || query.code.length > 4096) {
    throw Object.assign(new Error("Meta authorization was cancelled or returned an invalid code."), {
      status: 400,
      code: "META_OAUTH_DENIED",
    });
  }

  const shortToken = await exchangeAuthorizationCode(query.code, config);
  const longToken = await exchangeLongLivedToken(shortToken.access_token, config);
  const granted = new Set(await metaAdsProvider.getPermissions(longToken.access_token));
  const missing = config.scopes.filter((scope) => !granted.has(scope));
  if (missing.length) {
    throw Object.assign(new Error("Grant the requested Meta Ads and Page permissions, then connect again."), {
      status: 403,
      code: "META_PERMISSION_MISSING",
    });
  }
  const profile = await metaAdsProvider.getCurrentUser(longToken.access_token);
  const expiresIn = Number(longToken.expires_in || shortToken.expires_in || 0);
  await prisma.metaConnection.upsert({
    where: { userId },
    create: {
      userId,
      provider: "meta",
      accessToken: encryptToken(longToken.access_token),
      metaUserId: profile.id,
      scopes: [...granted].join(","),
      expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    },
    update: {
      provider: "meta",
      accessToken: encryptToken(longToken.access_token),
      metaUserId: profile.id,
      scopes: [...granted].join(","),
      expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
      adAccountId: null,
      adAccountName: null,
      adAccountCurrency: null,
      pageId: null,
      pageName: null,
    },
  });
  return { userId };
}

module.exports = { beginOAuth, finishOAuth };
