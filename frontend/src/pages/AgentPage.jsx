import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, Check, Circle, LoaderCircle, Play, RefreshCw, Sparkles } from "lucide-react";
import "./agent.css";

const emptyProduct = {
  name: "", description: "", price: "", category: "", features: "",
  targetCustomer: "", uniqueSellingPoints: "", website: "", industry: "", additionalInformation: "",
};
const emptyGoal = { objective: "", budget: "", campaignPeriod: "", targetPlatforms: [], constraints: "" };
const platforms = ["Facebook", "Google", "TikTok", "Website", "Email", "Other"];

export default function AgentPage({ request }) {
  const navigate = useNavigate();
  const { runId } = useParams();
  const [workers, setWorkers] = useState([]);
  const [history, setHistory] = useState([]);
  const [product, setProduct] = useState(emptyProduct);
  const [goal, setGoal] = useState(emptyGoal);
  const [selected, setSelected] = useState([]);
  const [run, setRun] = useState(null);
  const [mode, setMode] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const completed = useMemo(() => new Set((run?.steps || []).filter((step) => step.status === "SUCCEEDED").map((step) => step.workerSlug)), [run]);

  useEffect(() => {
    request("/workers").then((items) => setWorkers(items.filter((item) => item.available))).catch((e) => setError(e.message));
    request("/agent/runs").then(setHistory).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!runId) return;
    request(`/agent/runs/${runId}`).then((data) => {
      setRun(data);
      setProduct({ ...emptyProduct, ...data.productInput, features: (data.productInput?.features || []).join("\n"), uniqueSellingPoints: (data.productInput?.uniqueSellingPoints || []).join("\n") });
      setGoal({ ...emptyGoal, ...data.goal });
      setSelected(data.selectedWorkers || []);
      setMode(data.status === "SUCCEEDED" ? "result" : ["RUNNING", "PLANNING"].includes(data.status) ? "running" : data.status === "FAILED" ? "failed" : "review");
    }).catch((e) => setError(e.message));
  }, [runId]);

  useEffect(() => {
    if (mode !== "running" || !run?.id) return undefined;
    const timer = setInterval(() => {
      request(`/agent/runs/${run.id}`).then((updated) => {
        setRun(updated);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(updated.status)) {
          setMode(updated.status === "SUCCEEDED" ? "result" : "failed");
          setHistory((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
        }
      }).catch((e) => setError(e.message));
    }, 1200);
    return () => clearInterval(timer);
  }, [mode, run?.id]);

  function toggleWorker(slug) {
    setSelected((items) => items.includes(slug) ? items.filter((item) => item !== slug) : [...items, slug]);
  }

  async function createPlan(event) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const data = await request("/agent/plan", {
        method: "POST",
        body: JSON.stringify({
          product: {
            ...product,
            price: product.price || undefined,
            features: product.features.split("\n").map((item) => item.trim()).filter(Boolean),
            uniqueSellingPoints: product.uniqueSellingPoints.split("\n").map((item) => item.trim()).filter(Boolean),
          },
          marketingGoal: { ...goal, budget: goal.budget || undefined },
          selectedWorkers: selected,
        }),
      });
      setRun(data); setMode("review");
      setHistory((items) => [data, ...items.filter((item) => item.id !== data.id)]);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function startRun() {
    setError(""); setBusy(true);
    try {
      await request("/agent/run", { method: "POST", body: JSON.stringify({ runId: run.id }) });
      setRun((current) => ({ ...current, status: "RUNNING", steps: [] }));
      setMode("running");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function loadHistory(id) {
    setError("");
    try {
      const data = await request(`/agent/runs/${id}`);
      navigate(`/agent/runs/${id}`);
      setRun(data);
      setProduct({ ...emptyProduct, ...data.productInput, features: (data.productInput?.features || []).join("\n"), uniqueSellingPoints: (data.productInput?.uniqueSellingPoints || []).join("\n") });
      setGoal({ ...emptyGoal, ...data.goal });
      setSelected(data.selectedWorkers || []);
      setMode(data.status === "SUCCEEDED" ? "result" : data.status === "RUNNING" ? "running" : data.status === "FAILED" ? "failed" : "review");
    } catch (e) { setError(e.message); }
  }

  function reset() {
    navigate("/agent");
    setRun(null); setMode("form"); setError(""); setSelected([]);
    setProduct(emptyProduct); setGoal(emptyGoal);
  }

  const plan = run?.plan;
  const output = run?.finalOutput;

  return (
    <div className="agentPage">
      <div className="agentTitleRow">
        <div>
          <p className="eyebrow">ĐIỀU PHỐI NHIỀU WORKER</p>
          <h1>AI Marketing Agent</h1>
          <p className="muted">Nhập thông tin, xem kế hoạch, rồi duyệt để Agent thực hiện.</p>
        </div>
        {mode !== "form" && <button className="agentSecondary" onClick={reset}><RefreshCw size={15}/> Tạo lượt chạy mới</button>}
      </div>

      <div className="agentStepsBar">
        {["Thông tin", "Chọn Worker", "Duyệt kế hoạch", "Thực thi & kết quả"].map((label, index) => {
          const active = mode === "form" ? index < 2 : mode === "review" ? index < 3 : true;
          return <div className={active ? "agentStepLabel active" : "agentStepLabel"} key={label}><span>{index + 1}</span>{label}</div>;
        })}
      </div>
      {error && <div className="error agentError">{error}</div>}

      {mode === "form" && <form className="agentForm" onSubmit={createPlan}>
        <div className="agentFormGrid">
          <section className="panel agentPanel">
            <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={17}/></span><div><h2>Thông tin sản phẩm</h2><p>Mô tả sản phẩm; ngữ cảnh marketing đã lưu sẽ được tự động sử dụng.</p></div></div>
            <div className="agentFields">
              <label>Tên sản phẩm *<input required maxLength="160" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Ví dụ: Gundam RX-78-2"/></label>
              <label>Giá<input value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} placeholder="Ví dụ: 390.000 VNĐ"/></label>
              <label className="span2">Mô tả *<textarea required minLength={3} maxLength={3000} value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} placeholder="Sản phẩm là gì và có công dụng nào?"/></label>
              <label>Danh mục<input value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} placeholder="Mô hình lắp ráp"/></label>
              <label>Ngành hàng<input value={product.industry} onChange={(e) => setProduct({ ...product, industry: e.target.value })} placeholder="Đồ sưu tầm và sở thích"/></label>
              <label>Tính năng <small>Mỗi dòng một nội dung</small><textarea value={product.features} onChange={(e) => setProduct({ ...product, features: e.target.value })}/></label>
              <label>Điểm bán hàng nổi bật <small>Mỗi dòng một nội dung</small><textarea value={product.uniqueSellingPoints} onChange={(e) => setProduct({ ...product, uniqueSellingPoints: e.target.value })}/></label>
              <label>Khách hàng mục tiêu<input value={product.targetCustomer} onChange={(e) => setProduct({ ...product, targetCustomer: e.target.value })} placeholder="Sản phẩm dành cho ai?"/></label>
              <label>Website<input type="url" value={product.website} onChange={(e) => setProduct({ ...product, website: e.target.value })} placeholder="https://example.com"/></label>
              <label className="span2">Thông tin bổ sung<textarea value={product.additionalInformation} onChange={(e) => setProduct({ ...product, additionalInformation: e.target.value })}/></label>
            </div>
          </section>

          <section className="panel agentPanel">
            <div className="agentSectionHead"><span className="agentIcon"><Bot size={17}/></span><div><h2>Mục tiêu marketing</h2><p>Xác định kết quả mong muốn để các Worker cùng hướng tới.</p></div></div>
            <div className="agentFields">
              <label className="span2">Mục tiêu *<textarea required minLength={3} maxLength={1500} value={goal.objective} onChange={(e) => setGoal({ ...goal, objective: e.target.value })} placeholder="Tăng doanh số trong tháng 10"/></label>
              <label>Ngân sách<input value={goal.budget} onChange={(e) => setGoal({ ...goal, budget: e.target.value })} placeholder="Ví dụ: 10.000.000 VNĐ"/></label>
              <label>Thời gian chiến dịch<input value={goal.campaignPeriod} onChange={(e) => setGoal({ ...goal, campaignPeriod: e.target.value })} placeholder="Tháng 10"/></label>
              <fieldset className="span2 platformField"><legend>Target platforms</legend><div>{platforms.map((platform) => <label className="platformChoice" key={platform}><input type="checkbox" checked={goal.targetPlatforms.includes(platform)} onChange={() => setGoal({ ...goal, targetPlatforms: goal.targetPlatforms.includes(platform) ? goal.targetPlatforms.filter((item) => item !== platform) : [...goal.targetPlatforms, platform] })}/>{platform}</label>)}</div></fieldset>
              <label className="span2">Điều kiện cần lưu ý<textarea value={goal.constraints} onChange={(e) => setGoal({ ...goal, constraints: e.target.value })} placeholder="Yêu cầu về thương hiệu, pháp lý, thời gian hoặc ngân sách"/></label>
            </div>
          </section>
        </div>

        <section className="panel agentPanel selectPanel">
          <div className="agentSectionHead"><span className="agentIcon"><Check size={17}/></span><div><h2>Chọn Worker cho lượt chạy này</h2><p>Agent lập kế hoạch với các Worker khả dụng trong gói của bạn.</p></div><span className="selectedCount">Đã chọn {selected.length}/8 Worker</span></div>
          <div className="agentWorkerGrid">{workers.map((worker) => <label className={selected.includes(worker.slug) ? "agentWorkerChoice selected" : "agentWorkerChoice"} key={worker.slug}><input type="checkbox" checked={selected.includes(worker.slug)} disabled={!selected.includes(worker.slug) && selected.length >= 8} onChange={() => toggleWorker(worker.slug)}/><span><strong>{worker.name}</strong><small>{worker.description}</small></span><span className="workerTier">{worker.requiredPackage}</span></label>)}</div>
          {!workers.length && <p className="muted">Loading your available workers…</p>}
          <div className="agentActions"><span className="muted">Chọn từ 1 đến 8 Worker. Kế hoạch sẽ giải thích nếu cần đổi thứ tự.</span><button className="primary" disabled={busy || !selected.length}>{busy ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} Lập kế hoạch</button></div>
        </section>
      </form>}

      {mode === "review" && <section className="panel planReview">
        <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={17}/></span><div><h2>Duyệt kế hoạch thực hiện</h2><p><strong>{plan?.goal}</strong></p></div></div>
        {plan?.orderChanged && <div className="reorderNotice"><RefreshCw size={16}/><span><strong>Agent đã thay đổi thứ tự Worker</strong><small>{plan.reorderExplanation}</small></span></div>}
        {!plan?.orderChanged && <p className="planReasonIntro">{plan?.reorderExplanation}</p>}
        <div className="planTimeline">{plan?.steps?.map((step) => { const worker = workers.find((item) => item.slug === step.workerSlug); return <div className="planItem" key={step.workerSlug}><span className="planOrder">{step.order}</span><div><strong>{worker?.name || step.workerSlug}</strong><p>{step.reason}</p>{step.dependsOn?.length > 0 && <small>Phụ thuộc vào: {step.dependsOn.map((slug) => workers.find((item) => item.slug === slug)?.name || slug).join(", ")}</small>}</div></div>; })}</div>
        <div className="planProductSummary"><b>{run?.productInput?.name}</b><span>{run?.goal?.objective}</span><span>{run?.selectedWorkers?.length} Worker được chọn · kế hoạch đang chờ bạn duyệt</span></div>
        <div className="agentActions"><button className="agentSecondary" onClick={() => setMode("form")}><ArrowLeft size={15}/> Sửa thông tin hoặc Worker</button><button className="primary" disabled={busy} onClick={startRun}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} Duyệt kế hoạch và chạy Agent</button></div>
      </section>}

      {(mode === "running" || mode === "failed") && <section className="panel runProgress">
        <div className="agentSectionHead"><span className="agentIcon"><Bot size={17}/></span><div><h2>{mode === "failed" ? "Agent đã dừng" : "Agent đang thực hiện…"}</h2><p>{mode === "failed" ? "Lượt chạy chưa thể hoàn thành. Vui lòng thử lại sau." : "Các Worker đang chạy theo thứ tự đã duyệt; kết quả sẽ được dùng cho bước tiếp theo."}</p></div>{mode === "running" && <LoaderCircle className="spin progressSpinner" size={20}/>}</div>
        <div className="planTimeline">{plan?.steps?.map((step) => { const state = run?.steps?.find((item) => item.workerSlug === step.workerSlug); const done = completed.has(step.workerSlug); const retrying = state?.decision?.decision === "RETRY" && !done; const working = state?.status === "RUNNING"; return <div className="planItem runItem" key={step.workerSlug}><span className={done ? "runCheck done" : working ? "runCheck working" : "runCheck"}>{done ? <Check size={14}/> : working ? <LoaderCircle className="spin" size={14}/> : <Circle size={14}/>}</span><div><strong>{workers.find((item) => item.slug === step.workerSlug)?.name || step.workerSlug}</strong><p>{retrying ? `Đang thử lại lần ${Math.max(1, state.retryCount || 0)}/1` : working ? "Đang tạo và đánh giá kết quả…" : state?.status === "FAILED" ? "Worker chưa thể hoàn thành." : done ? "Hoàn thành" : "Chờ thực hiện"}</p></div></div>; })}</div>
        {mode === "failed" && <div className="agentActions"><button className="agentSecondary" onClick={reset}>Start another run</button></div>}
      </section>}

      {mode === "result" && <section className="agentResultLayout">
        <div className="panel finalSummary"><p className="eyebrow">KẾT QUẢ MARKETING</p><h2>{run?.productInput?.name} · {run?.goal?.objective}</h2><h3>Tóm tắt</h3><p>{output?.executiveSummary}</p><h3>Đề xuất tiếp theo</h3><ol>{output?.nextActions?.map((action, index) => <li key={index}>{action}</li>)}</ol></div>
        <div className="panel"><div className="agentSectionHead"><span className="agentIcon"><Check size={17}/></span><div><h2>Kết quả từ các Worker</h2><p>{output?.workerOutputs?.length || 0} Worker đã hoàn thành.</p></div></div>
          {(output?.workerOutputs || []).map((item) => <article className="agentOutputCard" key={item.workerSlug}><div><span className="workerTier">{item.workerName}</span><h3>{item.output.summary}</h3></div><div className="agentRecommendations">{item.output.recommendations?.map((rec, index) => <div key={index}><strong>{rec.title || `Recommendation ${index + 1}`}</strong><p>{rec.detail || JSON.stringify(rec)}</p></div>)}</div></article>)}
          {!!output?.assumptions?.length && <div className="assumptionBox"><strong>Giả định</strong><ul>{output.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        </div>
      </section>}

      <section className="agentHistory"><div className="sectionTitle"><div><h2>Lịch sử AI Agent</h2><p>Xem lại kế hoạch và kết quả đã lưu mà không cần chạy lại.</p></div></div><div className="agentHistoryList">{history.slice(0, 5).map((item) => <button key={item.id} className="agentHistoryItem" onClick={() => loadHistory(item.id)}><span><strong>{item.productInput?.name || "Lượt chạy marketing"}</strong><small>{item.goal?.objective || item.goal}</small><small>{item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : ""}</small></span><span className={`status ${item.status === "SUCCEEDED" ? "succeeded" : item.status === "FAILED" ? "failed" : "pending"}`}>{{SUCCEEDED:"Thành công",FAILED:"Thất bại",RUNNING:"Đang thực hiện",PENDING:"Chờ thực hiện",PLANNING:"Đang lập kế hoạch"}[item.status] || item.status}</span><ArrowRight size={15}/></button>)}</div></section>
    </div>
  );
}
