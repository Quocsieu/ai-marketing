import React, { useEffect, useState } from "react";
import { Check, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import MetaAdsBuilder from "./MetaAdsBuilder";

const statusLabel = (status) => ({ PAUSED: "Đang tạm dừng", ACTIVE: "Đang hoạt động", FAILED: "Tạo thất bại", UNKNOWN: "Cần kiểm tra trên Meta", CREATING: "Đang tạo" })[status] || status;

export default function MetaAdsSettings({ request }) {
  const [connection, setConnection] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadConnection() {
    const [status, items] = await Promise.all([
      request("/meta/status"),
      request("/meta/campaigns"),
    ]);
    setConnection(status);
    setCampaigns(items || []);
    if (status.connected) {
      const [accountItems, pageItems] = await Promise.all([
        request("/meta/ad-accounts"),
        request("/meta/pages"),
      ]);
      setAccounts(accountItems || []);
      setPages(pageItems || []);
    } else {
      setAccounts([]);
      setPages([]);
    }
  }

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("meta");
    if (result === "connected") setNotice("Đã kết nối Meta. Hãy chọn tài khoản quảng cáo và Trang.");
    if (result === "permission") setError("Bạn cần cấp các quyền Meta Ads và Page được yêu cầu rồi kết nối lại.");
    if (result === "error") setError("Không thể kết nối Meta. Hãy thử lại và kiểm tra cấu hình ứng dụng.");
    if (result) window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    loadConnection().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const data = await request("/meta/auth");
      window.location.assign(data.authorizationUrl);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function selectAsset(field, value) {
    setBusy(true);
    setError("");
    try {
      const result = await request("/meta/selection", {
        method: "PUT",
        body: JSON.stringify({ [field]: value || null }),
      });
      setConnection((current) => ({ ...current, ...result }));
      setNotice("Đã lưu tài khoản quảng cáo và Trang được chọn.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Ngắt kết nối Meta? Chiến dịch đã tạo trên Meta sẽ không bị xóa.")) return;
    setBusy(true);
    setError("");
    try {
      await request("/meta", { method: "DELETE" });
      setConnection({ connected: false });
      setAccounts([]);
      setPages([]);
      setNotice("Đã ngắt kết nối Meta. Campaign trên Meta vẫn được giữ nguyên.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function campaignAction(campaign, action) {
    if (action === "resume" && !window.confirm("Kích hoạt campaign trên Meta? Nếu tài khoản có ad set/quảng cáo đang hoạt động, quảng cáo có thể phân phối và phát sinh chi phí.")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/meta/campaigns/${campaign.externalCampaignId}/${action}`, {
        method: "POST",
        body: action === "resume" ? JSON.stringify({ confirm: true }) : JSON.stringify({}),
      });
      await loadConnection();
      setNotice(action === "resume" ? "Đã yêu cầu kích hoạt campaign." : "Đã tạm dừng campaign.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel metaPanel" aria-labelledby="meta-title">
      <div className="metaPanelHead">
        <span className="agentIcon">M</span>
        <div><p className="eyebrow">ADS INTEGRATION</p><h2 id="meta-title">Meta Ads</h2></div>
        {connection?.connected && <span className="metaConnected"><Check size={14}/> Đã kết nối</span>}
      </div>
      {loading ? <p className="muted"><LoaderCircle className="spin" size={16}/> Đang kiểm tra kết nối Meta…</p> : !connection?.connected ? (
        <div className="metaConnectRow">
          <p className="muted">Kết nối Meta để xem tài khoản quảng cáo và Facebook Page. Token được lưu mã hóa ở backend.</p>
          {connection?.reauthorizationRequired && <p className="error">Phiên Meta đã hết hạn. Hãy kết nối lại.</p>}
          <button className="primary" disabled={busy} onClick={connect}>{busy ? <LoaderCircle className="spin" size={16}/> : null} Kết nối Meta</button>
        </div>
      ) : (
        <>
          <div className="metaAccountGrid">
            <label>Tài khoản quảng cáo<select disabled={busy} value={connection.adAccount?.id || ""} onChange={(event) => selectAsset("adAccountId", event.target.value)}>
              <option value="">Chọn tài khoản quảng cáo</option>
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.currency} · {account.id}</option>)}
            </select></label>
            <label>Facebook Page<select disabled={busy} value={connection.page?.id || ""} onChange={(event) => selectAsset("pageId", event.target.value)}>
              <option value="">Chọn Page (không bắt buộc)</option>
              {pages.map((page) => <option value={page.id} key={page.id}>{page.name}</option>)}
            </select></label>
            <button className="agentSecondary" disabled={busy} onClick={() => loadConnection().catch((e) => setError(e.message))}><RefreshCw size={15}/> Tải lại tài khoản và Page</button>
            <button className="agentSecondary" disabled={busy} onClick={disconnect}><Unplug size={15}/> Ngắt kết nối</button>
          </div>
          <p className="muted metaScopeNote">Quyền đã cấp: {(connection.scopes || []).join(", ")}. Campaign được tạo ở trạng thái PAUSED.</p>
          <div className="metaCampaignList">
            <h3>Campaign đã tạo</h3>
            {!campaigns.length && <p className="muted">Chưa có campaign Meta nào được tạo từ Agent.</p>}
            {campaigns.map((campaign) => <div className="metaCampaignRow" key={campaign.id}>
              <span><strong>{campaign.name}</strong><small>{campaign.objective} · {statusLabel(campaign.status)}{campaign.errorCode ? ` · ${campaign.errorCode}` : ""}</small></span>
              {campaign.externalCampaignId && campaign.status === "ACTIVE" && <button className="agentSecondary" disabled={busy} onClick={() => campaignAction(campaign, "pause")}>Tạm dừng</button>}
              {campaign.externalCampaignId && campaign.status === "PAUSED" && <button className="agentSecondary" disabled={busy} onClick={() => campaignAction(campaign, "resume")}>Launch Campaign</button>}
            </div>)}
          </div>
          <MetaAdsBuilder
            request={request}
            campaigns={campaigns}
            pageId={connection.page?.id}
          />
        </>
      )}
      {notice && <p className="metaNotice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
