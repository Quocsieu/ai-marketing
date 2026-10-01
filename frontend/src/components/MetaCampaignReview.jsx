import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle, Sparkles } from "lucide-react";

const objectives = [
  ["OUTCOME_AWARENESS", "Nhận diện"],
  ["OUTCOME_TRAFFIC", "Lưu lượng truy cập"],
  ["OUTCOME_ENGAGEMENT", "Tương tác"],
  ["OUTCOME_LEADS", "Khách hàng tiềm năng"],
  ["OUTCOME_SALES", "Doanh số"],
  ["OUTCOME_APP_PROMOTION", "Quảng bá ứng dụng"],
];
const categories = ["CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING"];

export default function MetaCampaignReview({ request, run }) {
  const [connection, setConnection] = useState(null);
  const [preview, setPreview] = useState(null);
  const [specification, setSpecification] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [status, campaigns] = await Promise.all([request("/meta/status"), request("/meta/campaigns")]);
        if (!active) return;
        setConnection(status);
        const prior = (campaigns || []).find((item) => item.agentRunId === run.id);
        if (prior && prior.status !== "FAILED") {
          setCampaign(prior);
          return;
        }
        if (prior?.status === "FAILED") setError("Lần tạo campaign trước thất bại và Meta không xác nhận có campaign mới. Bạn có thể kiểm tra Meta rồi duyệt thử lại.");
        if (status.connected && status.adAccount?.id) {
          const data = await request("/meta/campaign-specifications", { method: "POST", body: JSON.stringify({ runId: run.id }) });
          if (active) {
            setPreview(data);
            setSpecification(data.campaign);
          }
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }
    load();
    return () => { active = false; };
  }, [request, run.id]);

  function update(field, value) {
    setSpecification((current) => ({ ...current, [field]: value }));
  }
  function updateNested(section, field, value) {
    setSpecification((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  }

  async function approve() {
    if (!window.confirm("Tạo campaign trên Meta ở trạng thái PAUSED? AI sẽ không tự bật quảng cáo.")) return;
    setBusy(true);
    setError("");
    try {
      const created = await request("/meta/campaigns", {
        method: "POST",
        body: JSON.stringify({ runId: run.id, specification, approved: true }),
      });
      setCampaign(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (campaign) return <section className="panel metaApprovalPanel">
    <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={16}/></span><div><h2>Meta Campaign</h2><p>{campaign.name} · {campaign.status || "PAUSED"}</p></div></div>
    {campaign.status === "PAUSED" && <p className="metaDeliveryNotice">Campaign đã được tạo ở trạng thái tạm dừng. MVP chưa tạo ad set hoặc quảng cáo nên hiện chưa phân phối và chưa phát sinh chi phí.</p>}
    {campaign.status === "UNKNOWN" && <p className="error">Meta chưa xác nhận kết quả tạo campaign. Kiểm tra Ads Manager trước khi thử lại để tránh tạo trùng.</p>}
  </section>;

  return <section className="panel metaApprovalPanel">
    <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={16}/></span><div><h2>Campaign Specification · Meta</h2><p>AI đề xuất; bạn xem và duyệt trước khi backend tạo campaign PAUSED.</p></div></div>
    {!connection?.connected ? <p className="muted">Kết nối Meta trong <Link to="/settings">Cài đặt</Link> để tạo Campaign Specification.</p> : !connection.adAccount?.id ? <p className="muted">Chọn tài khoản quảng cáo trong <Link to="/settings">Cài đặt → Meta Ads</Link> trước.</p> : !specification ? <p className="muted"><LoaderCircle className="spin" size={16}/> Đang tạo Campaign Specification…</p> : <>
      <div className="metaSpecAccount">Tài khoản: <strong>{preview?.adAccount?.name}</strong> · Tiền tệ: <strong>{specification.currency}</strong>{preview?.page && <> · Page: <strong>{preview.page.name}</strong></>}</div>
      <div className="metaSpecGrid">
        <label>Tên campaign<input value={specification.name} maxLength={255} onChange={(event) => update("name", event.target.value)}/></label>
        <label>Mục tiêu<select value={specification.objective} onChange={(event) => update("objective", event.target.value)}>{objectives.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Ngân sách mỗi ngày ({specification.currency})<input type="number" min="1" step="any" value={specification.dailyBudget ?? ""} onChange={(event) => update("dailyBudget", event.target.value === "" ? null : Number(event.target.value))}/></label>
        <label>Tuổi tối thiểu<input type="number" min="18" max="65" value={specification.audience.ageMin} onChange={(event) => updateNested("audience", "ageMin", Number(event.target.value))}/></label>
        <label>Tuổi tối đa<input type="number" min="18" max="65" value={specification.audience.ageMax} onChange={(event) => updateNested("audience", "ageMax", Number(event.target.value))}/></label>
        <label>Quốc gia (mã ISO, cách nhau dấu phẩy)<input value={specification.audience.countries.join(", ")} onChange={(event) => updateNested("audience", "countries", event.target.value.toUpperCase().split(",").map((item) => item.trim()).filter(Boolean))}/></label>
        <label className="metaSpecWide">Đối tượng khách hàng<textarea maxLength={1000} value={specification.audience.customerDescription} onChange={(event) => updateNested("audience", "customerDescription", event.target.value)}/></label>
        <label className="metaSpecWide">Nội dung chính<textarea maxLength={2000} value={specification.creative.primaryText} onChange={(event) => updateNested("creative", "primaryText", event.target.value)}/></label>
        <label>Tiêu đề<input maxLength={255} value={specification.creative.headline} onChange={(event) => updateNested("creative", "headline", event.target.value)}/></label>
        <label>Mô tả<textarea maxLength={1000} value={specification.creative.description} onChange={(event) => updateNested("creative", "description", event.target.value)}/></label>
      </div>
      <fieldset className="metaCategoryField"><legend>Danh mục quảng cáo đặc biệt</legend><p className="muted">Chọn đúng nếu quảng cáo liên quan tín dụng, việc làm, nhà ở, chính trị hoặc cờ bạc.</p><div>{categories.map((category) => <label key={category}><input type="checkbox" checked={specification.specialAdCategories.includes(category)} onChange={() => update("specialAdCategories", specification.specialAdCategories.includes(category) ? specification.specialAdCategories.filter((item) => item !== category) : [...specification.specialAdCategories, category])}/>{category}</label>)}</div></fieldset>
      <p className="metaDeliveryNotice">Duyệt sẽ chỉ tạo campaign PAUSED trên Meta. Audience và creative được lưu trong specification; MVP chưa tạo ad set hoặc quảng cáo nên campaign chưa thể phân phối hoặc tiêu tiền. Chỉ dùng “Launch Campaign” riêng nếu bạn đã kiểm tra ad set/quảng cáo trong Meta.</p>
      <button className="primary" disabled={busy || !specification.dailyBudget || !specification.name.trim()} onClick={approve}>{busy ? <LoaderCircle className="spin" size={16}/> : null} Approve &amp; Launch · Tạo campaign PAUSED</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
