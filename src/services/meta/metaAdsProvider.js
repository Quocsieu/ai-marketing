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

  async getPageInfo(accessToken, pageId) {
    return this.request(String(pageId), {
      accessToken,
      query: {
        fields: "id,name,is_published",
      },
    });
  }

  async request(path, { method = "GET", accessToken, query, body } = {}) {
    const { graphVersion } = getMetaConfig();
    const url = new URL(
      `https://graph.facebook.com/${graphVersion}/${path.replace(/^\/+/, "")}`,
    );
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null)
          url.searchParams.set(key, String(value));
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
      console.error("Meta Graph API transport error", {
        method,
        path,
        error: error.name,
      });
      throw Object.assign(
        new Error("Meta Ads is temporarily unavailable. Please try again."),
        {
          status: 502,
          code: "META_API_UNAVAILABLE",
        },
      );
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      const metaCode = result.error?.code || null;
      const safeMessage = String(
        result.error?.error_user_msg ||
          result.error?.message ||
          "Meta rejected the request.",
      )
        .replace(accessToken || "\0", "[redacted]")
        .slice(0, 500);
      console.error("Meta Graph API error", {
        method,
        path,
        metaCode,
        message: safeMessage,
      });
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
    return accounts
      .filter((account) => normalizeAdAccountId(account.id))
      .map((account) => ({
        id: account.id,
        accountId: account.account_id || normalizeAdAccountId(account.id),
        name: String(account.name || "Ad Account").slice(0, 255),
        currency: String(account.currency || "").slice(0, 8),
        timezone: String(account.timezone_name || "").slice(0, 80),
        status: account.account_status ?? null,
      }));
  }

  async getPages(accessToken) {
    const pages = await this.getCollection(
      "accounts",
      "id,name,category,tasks,access_token",
      accessToken,
    );

    console.log(
      "META PAGES:",
      pages.map((page) => ({
        id: page.id,
        name: page.name,
        tasks: page.tasks,
        hasAccessToken: Boolean(page.access_token),
      })),
    );

    return pages
      .filter((page) => normalizeObjectId(page.id))
      .map((page) => ({
        id: page.id,
        name: String(page.name || "Facebook Page").slice(0, 255),
        category: String(page.category || "").slice(0, 100),
        accessToken: page.access_token,
      }));
  }

  async createAdCreative({
    accessToken,
    adAccountId,
    name,
    pageId,
    message,
    headline,
    linkUrl,
    callToAction,
  }) {
    const accountId = normalizeAdAccountId(adAccountId);
    if (!accountId)
      throw Object.assign(new Error("Selected Meta ad account is invalid."), {
        status: 400,
        code: "META_INVALID_AD_ACCOUNT",
      });
    if (!normalizeObjectId(pageId))
      throw Object.assign(new Error("Facebook Page id is invalid."), {
        status: 400,
        code: "META_INVALID_PAGE_ID",
      });
    const validateText = (value, field, maxLength) => {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > maxLength
      ) {
        throw Object.assign(new Error(`${field} is invalid.`), {
          status: 400,
          code: "META_INVALID_INPUT",
        });
      }
      return value.trim();
    };
    const link = validateText(linkUrl, "Link URL", 2048);
    let parsedLink;
    try {
      parsedLink = new URL(link);
    } catch {
      /* checked below */
    }
    if (!parsedLink || parsedLink.protocol !== "https:") {
      throw Object.assign(new Error("Creative link URL must use HTTPS."), {
        status: 400,
        code: "META_INVALID_LINK_URL",
      });
    }
    const allowedCallToActions = [
      "LEARN_MORE",
      "SHOP_NOW",
      "SIGN_UP",
      "CONTACT_US",
      "DOWNLOAD",
      "BOOK_TRAVEL",
      "GET_OFFER",
      "SUBSCRIBE",
    ];
    if (!allowedCallToActions.includes(callToAction)) {
      throw Object.assign(new Error("Call to action is invalid."), {
        status: 400,
        code: "META_INVALID_CALL_TO_ACTION",
      });
    }
    const objectStorySpec = {
      page_id: String(pageId),
      link_data: {
        link: parsedLink.toString(),
        message: validateText(message, "Primary text", 2000),
        name: validateText(headline, "Headline", 255),
        call_to_action: {
          type: callToAction,
          value: { link: parsedLink.toString() },
        },
      },
    };

    console.log("META CREATIVE INPUT:", {
      adAccountId: accountId,
      pageId,
      name,
      linkUrl: parsedLink.toString(),
      callToAction,
      objectStorySpec,
    });

    return this.request(`act_${accountId}/adcreatives`, {
      method: "POST",
      accessToken,
      body: {
        name: validateText(name, "Creative name", 255),
        object_story_spec: JSON.stringify(objectStorySpec),
      },
    });
  }

  async createAdSet({
    accessToken,
    adAccountId,
    campaignId,
    name,
    bidAmountMinor,
    billingEvent,
    optimizationGoal,
    targeting,
    status,
    promotedObject,
  }) {
    const accountId = normalizeAdAccountId(adAccountId);
    if (!accountId) {
      throw Object.assign(new Error("Selected Meta ad account is invalid."), {
        status: 400,
        code: "META_INVALID_AD_ACCOUNT",
      });
    }
    const normalizedCampaignId = normalizeObjectId(campaignId);
    if (!normalizedCampaignId) {
      throw Object.assign(new Error("Meta campaign id is invalid."), {
        status: 400,
        code: "META_INVALID_CAMPAIGN_ID",
      });
    }
    if (typeof name !== "string" || !name.trim() || name.trim().length > 255) {
      throw Object.assign(new Error("Ad Set name is invalid."), {
        status: 400,
        code: "META_INVALID_INPUT",
      });
    }
    if (!Number.isSafeInteger(bidAmountMinor) || bidAmountMinor <= 0) {
      throw Object.assign(new Error("Bid amount is invalid."), {
        status: 400,
        code: "META_INVALID_BID_AMOUNT",
      });
    }
    const billingEvents = [
      "IMPRESSIONS",
      "LINK_CLICKS",
      "POST_ENGAGEMENT",
      "VIDEO_VIEWS",
      "LEAD_GENERATION",
    ];
    const optimizationGoals = [
      "REACH",
      "IMPRESSIONS",
      "LINK_CLICKS",
      "LANDING_PAGE_VIEWS",
      "POST_ENGAGEMENT",
      "VIDEO_VIEWS",
      "LEAD_GENERATION",
      "OFFSITE_CONVERSIONS",
      "CONVERSATIONS",
    ];
    if (!billingEvents.includes(billingEvent)) {
      throw Object.assign(new Error("Billing event is invalid."), {
        status: 400,
        code: "META_INVALID_BILLING_EVENT",
      });
    }
    if (!optimizationGoals.includes(optimizationGoal)) {
      throw Object.assign(new Error("Optimization goal is invalid."), {
        status: 400,
        code: "META_INVALID_OPTIMIZATION_GOAL",
      });
    }
    if (
      !targeting ||
      typeof targeting !== "object" ||
      Array.isArray(targeting) ||
      Object.getPrototypeOf(targeting) !== Object.prototype
    ) {
      throw Object.assign(new Error("Targeting must be a JSON object."), {
        status: 400,
        code: "META_INVALID_TARGETING",
      });
    }
    let serializedTargeting;
    try {
      const targetingAutomation = targeting.targeting_automation;
      if (
        targetingAutomation !== undefined &&
        (!targetingAutomation ||
          typeof targetingAutomation !== "object" ||
          Array.isArray(targetingAutomation) ||
          Object.getPrototypeOf(targetingAutomation) !== Object.prototype)
      ) {
        throw new Error("Invalid targeting automation.");
      }
      const advantageAudience = targetingAutomation?.advantage_audience;
      if (
        advantageAudience !== undefined &&
        advantageAudience !== 0 &&
        advantageAudience !== 1
      ) {
        throw new Error("Invalid Advantage audience flag.");
      }
      serializedTargeting = JSON.stringify({
        ...targeting,
        targeting_automation: {
          ...targetingAutomation,
          advantage_audience: advantageAudience ?? 0,
        },
      });
    } catch {
      throw Object.assign(new Error("Targeting must be valid JSON."), {
        status: 400,
        code: "META_INVALID_TARGETING",
      });
    }
    if (
      !serializedTargeting ||
      serializedTargeting === "{}" ||
      serializedTargeting.length > 20000
    ) {
      throw Object.assign(
        new Error("Targeting must be a non-empty JSON object under 20 KB."),
        {
          status: 400,
          code: "META_INVALID_TARGETING",
        },
      );
    }
    if (status !== undefined && status !== "PAUSED") {
      throw Object.assign(
        new Error("New Meta Ad Sets must be created paused."),
        {
          status: 400,
          code: "META_INVALID_RESOURCE_STATUS",
        },
      );
    }

    let serializedPromotedObject;
    if (promotedObject !== undefined) {
      if (
        !promotedObject ||
        typeof promotedObject !== "object" ||
        Array.isArray(promotedObject) ||
        !normalizeObjectId(promotedObject.pixel_id) ||
        promotedObject.custom_event_type !== "CONTENT_VIEW"
      ) {
        throw Object.assign(
          new Error("Promoted object configuration is invalid."),
          { status: 400, code: "META_INVALID_PROMOTED_OBJECT" },
        );
      }
      serializedPromotedObject = JSON.stringify({
        pixel_id: String(promotedObject.pixel_id),
        custom_event_type: promotedObject.custom_event_type,
      });
    }

    return this.request(`act_${accountId}/adsets`, {
      method: "POST",
      accessToken,
      body: {
        name: name.trim(),
        campaign_id: normalizedCampaignId,
        billing_event: billingEvent,
        optimization_goal: optimizationGoal,
        bid_amount: String(bidAmountMinor),
        targeting: serializedTargeting,
        ...(serializedPromotedObject
          ? { promoted_object: serializedPromotedObject }
          : {}),
        status: "PAUSED",
      },
    });
  }

  async createCampaign({ accessToken, adAccountId, specification }) {
    const accountId = normalizeAdAccountId(adAccountId);
    if (!accountId)
      throw Object.assign(new Error("Selected Meta ad account is invalid."), {
        status: 400,
        code: "META_INVALID_AD_ACCOUNT",
      });
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
    if (
      Number.isSafeInteger(specification.dailyBudgetMinor) &&
      specification.dailyBudgetMinor > 0
    ) {
      body.daily_budget = String(specification.dailyBudgetMinor);
    }
    return this.request(`act_${accountId}/campaigns`, {
      method: "POST",
      accessToken,
      body,
    });
  }

  async getCampaign({ accessToken, campaignId }) {
    if (!normalizeObjectId(campaignId))
      throw Object.assign(new Error("Meta campaign id is invalid."), {
        status: 400,
        code: "META_INVALID_CAMPAIGN_ID",
      });
    return this.request(campaignId, {
      accessToken,
      query: {
        fields:
          "id,name,objective,status,account_id,bid_strategy,daily_budget,lifetime_budget,spend_cap",
      },
    });
  }

  async updateCampaignStatus({ accessToken, campaignId, status }) {
    if (
      !normalizeObjectId(campaignId) ||
      !["PAUSED", "ACTIVE"].includes(status)
    ) {
      throw Object.assign(
        new Error("Meta campaign status request is invalid."),
        { status: 400, code: "META_INVALID_CAMPAIGN_STATUS" },
      );
    }
    return this.request(campaignId, {
      method: "POST",
      accessToken,
      body: { status },
    });
  }

  pauseCampaign({ accessToken, campaignId }) {
    return this.updateCampaignStatus({
      accessToken,
      campaignId,
      status: "PAUSED",
    });
  }

  resumeCampaign({ accessToken, campaignId }) {
    return this.updateCampaignStatus({
      accessToken,
      campaignId,
      status: "ACTIVE",
    });
  }
}

module.exports = { MetaAdsProvider, normalizeAdAccountId, normalizeObjectId };
