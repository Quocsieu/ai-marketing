import React, { useState } from "react";
import { LoaderCircle } from "lucide-react";

const actions = [
  "IMPRESSIONS",
  "LINK_CLICKS",
  "POST_ENGAGEMENT",
  "VIDEO_VIEWS",
  "LEAD_GENERATION",
];
const goals = [
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
const callToActions = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "CONTACT_US",
  "DOWNLOAD",
  "BOOK_TRAVEL",
  "GET_OFFER",
  "SUBSCRIBE",
];
const countries = [
  ["VN", "Vietnam"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["SG", "Singapore"],
  ["TH", "Thailand"],
  ["MY", "Malaysia"],
  ["ID", "Indonesia"],
  ["PH", "Philippines"],
  ["AU", "Australia"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
];

function targetingValidationMessage(targeting) {
  if (!targeting || typeof targeting !== "object" || Array.isArray(targeting)) {
    return "Targeting must be a JSON object.";
  }
  if (!Number.isInteger(targeting.age_min) || !Number.isInteger(targeting.age_max)) {
    return "Age Min and Age Max must be valid whole numbers.";
  }
  if (targeting.age_min > targeting.age_max) {
    return "Age Min must be less than or equal to Age Max.";
  }
  const geo = targeting.geo_locations;
  if (!geo || !Array.isArray(geo.countries) || !geo.countries.some((country) => typeof country === "string" && country.trim())) {
    return "Select at least one country for your audience.";
  }
  const validLocationTypes = ["home", "recent"];
  if (!Array.isArray(geo.location_types) || !geo.location_types.some((type) => validLocationTypes.includes(type))) {
    return "Select at least one location type: Home or Recent.";
  }
  if (geo.location_types.some((type) => !validLocationTypes.includes(type))) {
    return "Location Type can only contain Home and Recent.";
  }
  return "";
}

export default function MetaAdsBuilder({ request, campaigns, pageId, currency }) {
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [adSetName, setAdSetName] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [billingEvent, setBillingEvent] = useState("IMPRESSIONS");
  const [optimizationGoal, setOptimizationGoal] = useState("OFFSITE_CONVERSIONS");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("35");
  const [country, setCountry] = useState("VN");
  const [locationTypes, setLocationTypes] = useState(["home", "recent"]);
  const [advancedTargeting, setAdvancedTargeting] = useState(false);
  const [rawTargeting, setRawTargeting] = useState("");
  const [targetingError, setTargetingError] = useState("");
  const [creativeName, setCreativeName] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [callToAction, setCallToAction] = useState("LEARN_MORE");
  const [adName, setAdName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(path, body, onSuccess) {
    setBusy(true);
    setError("");
    setNotice("");
    console.log("SUBMIT PATH:", path);
    console.log("SUBMIT BODY:", body);

    try {
      const result = await request(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSuccess(result);
      setNotice(`Created successfully: ${result.id} · ${result.status}`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function createAdSet(event) {
    console.log("CREATE AD SET CLICKED");
    event.preventDefault();
    let parsedTargeting;
    if (advancedTargeting) {
      try {
        parsedTargeting = JSON.parse(rawTargeting);
      } catch {
        setTargetingError("Raw Targeting must contain valid JSON.");
        return;
      }
    } else {
      parsedTargeting = {
        age_min: ageMin.trim() === "" ? Number.NaN : Number(ageMin),
        age_max: ageMax.trim() === "" ? Number.NaN : Number(ageMax),
        geo_locations: {
          countries: country ? [country] : [],
          location_types: locationTypes,
        },
      };
    }
    const validationMessage = targetingValidationMessage(parsedTargeting);
    if (validationMessage) {
      setTargetingError(validationMessage);
      return;
    }
    setTargetingError("");
    console.log("SENDING CREATE AD SET:", {
      campaignId,
      name: adSetName,
      bidAmount: Number(bidAmount),
      billingEvent,
      optimizationGoal,
      targeting: parsedTargeting,
    });
    await submit(
      "/meta/ad-sets",
      {
        campaignId,
        name: adSetName,
        bidAmount: Number(bidAmount),
        billingEvent,
        optimizationGoal,
        targeting: parsedTargeting,
        status: "PAUSED",
      },
      (result) => setAdSetId(result.id),
    );
  }

  async function createCreative(event) {
    event.preventDefault();
    if (!pageId) {
      setError("Select a Facebook Page in Meta Settings first.");
      return;
    }
    await submit(
      "/meta/ad-creatives",
      {
        name: creativeName,
        pageId,
        message,
        headline,
        linkUrl,
        callToAction,
      },
      (result) => setCreativeId(result.id),
    );
  }

  async function createAd(event) {
    event.preventDefault();
    await submit(
      "/meta/ads",
      { adSetId, creativeId, name: adName, status: "PAUSED" },
      () => {},
    );
  }

  return (
    <div className="metaCampaignList">
      <h3>Create Ad Set → Creative → Ad</h3>
      <p className="muted">
        Every new delivery resource is created PAUSED. No image or video upload
        is included. Creating these resources does not activate delivery.
      </p>
      <form className="metaAccountGrid" onSubmit={createAdSet}>
        <label>
          Campaign
          <select
            required
            value={campaignId}
            onChange={(event) => {
              setCampaignId(event.target.value);
              setAdSetId("");
              setCreativeId("");
            }}
          >
            <option value="">Select a campaign</option>
            {campaigns
              .filter(
                (item) => item.externalCampaignId && item.status === "PAUSED",
              )
              .map((item) => (
                <option key={item.id} value={item.externalCampaignId}>
                  {item.name} · {item.status}
                </option>
              ))}
          </select>
        </label>
        <label>
          Ad Set name
          <input
            required
            maxLength="255"
            value={adSetName}
            onChange={(event) => setAdSetName(event.target.value)}
          />
        </label>
        <label>
          Bid amount ({currency || "account currency"})
          <input
            required
            type="number"
            min="0.01"
            step="any"
            value={bidAmount}
            onChange={(event) => setBidAmount(event.target.value)}
          />
        </label>
        <label>
          Billing event
          <select
            value={billingEvent}
            onChange={(event) => setBillingEvent(event.target.value)}
          >
            {actions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Optimization goal
          <select
            value={optimizationGoal}
            onChange={(event) => setOptimizationGoal(event.target.value)}
          >
            {goals.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="metaTargetingPanel">
          <strong>Targeting</strong>
          <div className="metaAgeRange">
            <label>
              Age Min
              <input
                type="number"
                step="1"
                value={ageMin}
                onChange={(event) => {
                  setAgeMin(event.target.value);
                  setTargetingError("");
                }}
                disabled={advancedTargeting}
              />
            </label>
            <span>to</span>
            <label>
              Age Max
              <input
                type="number"
                step="1"
                value={ageMax}
                onChange={(event) => {
                  setAgeMax(event.target.value);
                  setTargetingError("");
                }}
                disabled={advancedTargeting}
              />
            </label>
          </div>
          <label>
            Country
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setTargetingError("");
              }}
              disabled={advancedTargeting}
            >
              <option value="">Select a country</option>
              {countries.map(([code, name]) => (
                <option value={code} key={code}>{name}</option>
              ))}
            </select>
          </label>
          <div>
            <span>Location Type</span>
            <div className="metaLocationOptions">
              {[["home", "Home"], ["recent", "Recent"]].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={locationTypes.includes(value)}
                    disabled={advancedTargeting}
                    onChange={(event) => {
                      setLocationTypes((current) => event.target.checked
                        ? [...current, value]
                        : current.filter((type) => type !== value));
                      setTargetingError("");
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <details
            className="metaRawTargeting"
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setAdvancedTargeting(isOpen);
              setTargetingError("");
              if (isOpen) {
                setRawTargeting(JSON.stringify({
                  age_min: ageMin.trim() === "" ? null : Number(ageMin),
                  age_max: ageMax.trim() === "" ? null : Number(ageMax),
                  geo_locations: {
                    countries: country ? [country] : [],
                    location_types: locationTypes,
                  },
                }, null, 2));
              }
            }}
          >
            <summary>Advanced / Raw Targeting</summary>
            <p className="muted">Raw Targeting overrides the visual fields while this section is open.</p>
            <textarea
              rows="7"
              value={rawTargeting}
              onChange={(event) => {
                setRawTargeting(event.target.value);
                setTargetingError("");
              }}
              aria-label="Raw Targeting JSON"
            />
          </details>
          {targetingError && <p className="error" role="alert">{targetingError}</p>}
        </div>
        <p className="muted metaWideField">
          Campaigns created here already have a campaign-level daily budget.
          Leave this blank to use that budget; Meta does not allow setting both
          campaign and Ad Set budgets.
        </p>
        <button className="agentSecondary" disabled={busy || !campaignId}>
          {busy ? <LoaderCircle className="spin" size={15} /> : null} Create Ad
          Set (PAUSED)
        </button>
      </form>
      {adSetId && (
        <p className="metaNotice">
          Ad Set ID: <code>{adSetId}</code> · PAUSED
        </p>
      )}

      <form className="metaAccountGrid" onSubmit={createCreative}>
        <label>
          Creative name
          <input
            required
            maxLength="255"
            value={creativeName}
            onChange={(event) => setCreativeName(event.target.value)}
          />
        </label>
        <label>
          Call to action
          <select
            value={callToAction}
            onChange={(event) => setCallToAction(event.target.value)}
          >
            {callToActions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="metaWideField">
          Primary text
          <textarea
            required
            maxLength="2000"
            rows="3"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <label>
          Headline
          <input
            required
            maxLength="255"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
          />
        </label>
        <label>
          HTTPS destination URL
          <input
            required
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <button
          className="agentSecondary"
          disabled={busy || !pageId}
        >
          {busy ? <LoaderCircle className="spin" size={15} /> : null} Create
          Creative
        </button>
      </form>
      {!pageId && (
        <p className="muted">
          Select a Facebook Page above before creating a creative.
        </p>
      )}
      {creativeId && (
        <p className="metaNotice">
          Creative ID: <code>{creativeId}</code> · Created
        </p>
      )}

      <form className="metaAccountGrid" onSubmit={createAd}>
        <label>
          Ad name
          <input
            required
            maxLength="255"
            value={adName}
            onChange={(event) => setAdName(event.target.value)}
          />
        </label>
        <button
          className="agentSecondary"
          disabled={busy || !adSetId || !creativeId}
        >
          {busy ? <LoaderCircle className="spin" size={15} /> : null} Create Ad
          (PAUSED)
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="metaNotice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
