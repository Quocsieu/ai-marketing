const { getMetaConfig } = require("./metaConfig");

function normalizeAdAccountId(value) {
  const raw = String(value || "").replace(/^act_/, "");
  return /^\d{1,32}$/.test(raw) ? raw : null;
}

function normalizeObjectId(value) {
  return /^\d{1,40}$/.test(String(value || "")) ? String(value) : null;
}

class MetaAdsProvider {
  constructor(fetchImpl = fetch) {
    this.fetch = fetchImpl;
  }

  async request(path, { method = "GET", accessToken, query, body } = {}) {
    const { graphVersion } = getMetaConfig();
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\/+/, "")}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const headers = { Accept: "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body: body ? new URLSearchParams(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      console.error("Meta Graph API transport error", { method, path, error: error.name });
      throw Object.assign(new Error("Meta Ads is temporarily unavailable. Please try again."), {
        status: 502,
        code: "META_API_UNAVAILABLE",
      });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      const metaCode = result.error?.code || null;
      const safeMessage = String(result.error?.error_user_msg || result.error?.message || "Meta rejected the request.")
        .replace(accessToken || "\0", "[redacted]")
        .slice(0, 500);
      console.error("Meta Graph API error", { method, path, metaCode, message: safeMessage });
      throw Object.assign(new Error(safeMessage), {
        status: 502,
        code: "META_API_ERROR",
        metaCode,
      });
    }
    return result;
  }

  getCurrentUser(accessToken) {
    return this.request("me", { accessToken, query: { fields: "id,name" } });
  }

  async getPermissions(accessToken) {
    const result = await this.request("me/permissions", { accessToken });
    return (result.data || [])
      .filter((permission) => permission.status === "granted")
      .map((permission) => permission.permission);
  }

  async getCollection(edge, fields, accessToken) {
    const results = [];
    let after;
    for (let page = 0; page < 20; page += 1) {
      const response = await this.request(`me/${edge}`, {
        accessToken,
        query: { fields, limit: 100, ...(after ? { after } : {}) },
      });
      results.push(...(Array.isArray(response.data) ? response.data : []));
      after = response.paging?.cursors?.after;
      if (!response.paging?.next || !after) break;
    }
    return results;
  }

  async getAdAccounts(accessToken) {
    const accounts = await this.getCollection(
      "adaccounts",
      "id,name,account_id,currency,timezone_name,account_status",
      accessToken,
    );
    return accounts.filter((account) => normalizeAdAccountId(account.id)).map((account) => ({
      id: account.id,
      accountId: account.account_id || normalizeAdAccountId(account.id),
      name: String(account.name || "Ad Account").slice(0, 255),
      currency: String(account.currency || "").slice(0, 8),
      timezone: String(account.timezone_name || "").slice(0, 80),
      status: account.account_status ?? null,
    }));
  }

  async getPages(accessToken) {
    const pages = await this.getCollection("accounts", "id,name,category", accessToken);
    return pages.filter((page) => normalizeObjectId(page.id)).map((page) => ({
      id: page.id,
      name: String(page.name || "Facebook Page").slice(0, 255),
      category: String(page.category || "").slice(0, 100),
    }));
  }

  async createCampaign({ accessToken, adAccountId, specification }) {
    const accountId = normalizeAdAccountId(adAccountId);
    if (!accountId) throw Object.assign(new Error("Selected Meta ad account is invalid."), { status: 400, code: "META_INVALID_AD_ACCOUNT" });
    const categories = specification.specialAdCategories?.length
      ? JSON.stringify(specification.specialAdCategories)
      : "NONE";
    const body = {
      name: specification.name,
      objective: specification.objective,
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: categories,
      is_adset_budget_sharing_enabled: "false",
    };
    if (Number.isSafeInteger(specification.dailyBudgetMinor) && specification.dailyBudgetMinor > 0) {
      body.daily_budget = String(specification.dailyBudgetMinor);
    }
    return this.request(`act_${accountId}/campaigns`, {
      method: "POST",
      accessToken,
      body,
    });
  }

  async getCampaign({ accessToken, campaignId }) {
    if (!normalizeObjectId(campaignId)) throw Object.assign(new Error("Meta campaign id is invalid."), { status: 400, code: "META_INVALID_CAMPAIGN_ID" });
    return this.request(campaignId, {
      accessToken,
      query: { fields: "id,name,objective,status,account_id" },
    });
  }

  async updateCampaignStatus({ accessToken, campaignId, status }) {
    if (!normalizeObjectId(campaignId) || !["PAUSED", "ACTIVE"].includes(status)) {
      throw Object.assign(new Error("Meta campaign status request is invalid."), { status: 400, code: "META_INVALID_CAMPAIGN_STATUS" });
    }
    return this.request(campaignId, {
      method: "POST",
      accessToken,
      body: { status },
    });
  }

  pauseCampaign({ accessToken, campaignId }) {
    return this.updateCampaignStatus({ accessToken, campaignId, status: "PAUSED" });
  }

  resumeCampaign({ accessToken, campaignId }) {
    return this.updateCampaignStatus({ accessToken, campaignId, status: "ACTIVE" });
  }
}

module.exports = { MetaAdsProvider, normalizeAdAccountId, normalizeObjectId };
