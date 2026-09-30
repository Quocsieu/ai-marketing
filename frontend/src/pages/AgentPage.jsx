import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, Circle, LoaderCircle, Play, RefreshCw, Sparkles } from "lucide-react";
import "./agent.css";

const emptyProduct = {
  name: "", description: "", price: "", category: "", features: "",
  targetCustomer: "", uniqueSellingPoints: "", website: "", industry: "", additionalInformation: "",
};
const emptyGoal = { objective: "", budget: "", campaignPeriod: "", targetPlatforms: [], constraints: "" };
const platforms = ["Facebook", "Google", "TikTok", "Website", "Email", "Other"];

export default function AgentPage({ request }) {
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
    request("/workers").then((items) => setWorkers(items.filter((item) => item.available)));
    request("/agent/runs").then(setHistory);
  }, []);

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
      setRun(data);
      setProduct({ ...emptyProduct, ...data.productInput, features: (data.productInput?.features || []).join("\n"), uniqueSellingPoints: (data.productInput?.uniqueSellingPoints || []).join("\n") });
      setGoal({ ...emptyGoal, ...data.goal });
      setSelected(data.selectedWorkers || []);
      setMode(data.status === "SUCCEEDED" ? "result" : data.status === "RUNNING" ? "running" : data.status === "FAILED" ? "failed" : "review");
    } catch (e) { setError(e.message); }
  }

  function reset() {
    setRun(null); setMode("form"); setError(""); setSelected([]);
    setProduct(emptyProduct); setGoal(emptyGoal);
  }

  const plan = run?.plan;
  const output = run?.finalOutput;

  return (
    <div className="agentPage">
      <div className="agentTitleRow">
        <div>
          <p className="eyebrow">MULTI-WORKER ORCHESTRATION</p>
          <h1>AI Marketing Agent</h1>
          <p className="muted">Plan a focused marketing task, review the worker order, then run it with your approved team.</p>
        </div>
        {mode !== "form" && <button className="agentSecondary" onClick={reset}><RefreshCw size={15}/> New run</button>}
      </div>

      <div className="agentStepsBar">
        {["Product & goal", "Select workers", "Review plan", "Run & results"].map((label, index) => {
          const active = mode === "form" ? index < 2 : mode === "review" ? index < 3 : true;
          return <div className={active ? "agentStepLabel active" : "agentStepLabel"} key={label}><span>{index + 1}</span>{label}</div>;
        })}
      </div>
      {error && <div className="error agentError">{error}</div>}

      {mode === "form" && <form className="agentForm" onSubmit={createPlan}>
        <div className="agentFormGrid">
          <section className="panel agentPanel">
            <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={17}/></span><div><h2>Product information</h2><p>Describe the product. Saved Marketing Context is included automatically.</p></div></div>
            <div className="agentFields">
              <label>Product name *<input required maxLength="160" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="e.g. Gundam RX-78-2"/></label>
              <label>Price<input value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} placeholder="e.g. 390,000 VND"/></label>
              <label className="span2">Description *<textarea required minLength={3} maxLength={3000} value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} placeholder="What is the product and what does it do?"/></label>
              <label>Category<input value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} placeholder="Model kit"/></label>
              <label>Industry<input value={product.industry} onChange={(e) => setProduct({ ...product, industry: e.target.value })} placeholder="Hobbies & collectibles"/></label>
              <label>Features <small>One per line</small><textarea value={product.features} onChange={(e) => setProduct({ ...product, features: e.target.value })}/></label>
              <label>Unique selling points <small>One per line</small><textarea value={product.uniqueSellingPoints} onChange={(e) => setProduct({ ...product, uniqueSellingPoints: e.target.value })}/></label>
              <label>Target customer<input value={product.targetCustomer} onChange={(e) => setProduct({ ...product, targetCustomer: e.target.value })} placeholder="Who is this for?"/></label>
              <label>Website<input type="url" value={product.website} onChange={(e) => setProduct({ ...product, website: e.target.value })} placeholder="https://example.com"/></label>
              <label className="span2">Additional information<textarea value={product.additionalInformation} onChange={(e) => setProduct({ ...product, additionalInformation: e.target.value })}/></label>
            </div>
          </section>

          <section className="panel agentPanel">
            <div className="agentSectionHead"><span className="agentIcon"><Bot size={17}/></span><div><h2>Marketing goal</h2><p>Set the outcome the selected workers should support.</p></div></div>
            <div className="agentFields">
              <label className="span2">Objective *<textarea required minLength={3} maxLength={1500} value={goal.objective} onChange={(e) => setGoal({ ...goal, objective: e.target.value })} placeholder="Increase product sales during October"/></label>
              <label>Budget<input value={goal.budget} onChange={(e) => setGoal({ ...goal, budget: e.target.value })} placeholder="e.g. 10,000,000 VND"/></label>
              <label>Campaign period<input value={goal.campaignPeriod} onChange={(e) => setGoal({ ...goal, campaignPeriod: e.target.value })} placeholder="October"/></label>
              <fieldset className="span2 platformField"><legend>Target platforms</legend><div>{platforms.map((platform) => <label className="platformChoice" key={platform}><input type="checkbox" checked={goal.targetPlatforms.includes(platform)} onChange={() => setGoal({ ...goal, targetPlatforms: goal.targetPlatforms.includes(platform) ? goal.targetPlatforms.filter((item) => item !== platform) : [...goal.targetPlatforms, platform] })}/>{platform}</label>)}</div></fieldset>
              <label className="span2">Constraints<textarea value={goal.constraints} onChange={(e) => setGoal({ ...goal, constraints: e.target.value })} placeholder="Brand, legal, timing, or budget constraints"/></label>
            </div>
          </section>
        </div>

        <section className="panel agentPanel selectPanel">
          <div className="agentSectionHead"><span className="agentIcon"><Check size={17}/></span><div><h2>Choose the workers for this run</h2><p>The Agent can only plan with workers available in your package and selected here.</p></div><span className="selectedCount">{selected.length} selected</span></div>
          <div className="agentWorkerGrid">{workers.map((worker) => <label className={selected.includes(worker.slug) ? "agentWorkerChoice selected" : "agentWorkerChoice"} key={worker.slug}><input type="checkbox" checked={selected.includes(worker.slug)} disabled={!selected.includes(worker.slug) && selected.length >= 8} onChange={() => toggleWorker(worker.slug)}/><span><strong>{worker.name}</strong><small>{worker.description}</small></span><span className="workerTier">{worker.requiredPackage}</span></label>)}</div>
          {!workers.length && <p className="muted">Loading your available workers…</p>}
          <div className="agentActions"><span className="muted">Select 1 to 8 workers. The plan can reorder them and will explain why.</span><button className="primary" disabled={busy || !selected.length}>{busy ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} Create plan</button></div>
        </section>
      </form>}

      {mode === "review" && <section className="panel planReview">
        <div className="agentSectionHead"><span className="agentIcon"><Sparkles size={17}/></span><div><h2>Review your execution plan</h2><p><strong>{plan?.goal}</strong></p></div></div>
        {plan?.orderChanged && <div className="reorderNotice"><RefreshCw size={16}/><span><strong>Agent reordered your selection</strong><small>{plan.reorderExplanation}</small></span></div>}
        {!plan?.orderChanged && <p className="planReasonIntro">{plan?.reorderExplanation}</p>}
        <div className="planTimeline">{plan?.steps?.map((step) => { const worker = workers.find((item) => item.slug === step.workerSlug); return <div className="planItem" key={step.workerSlug}><span className="planOrder">{step.order}</span><div><strong>{worker?.name || step.workerSlug}</strong><p>{step.reason}</p>{step.dependsOn?.length > 0 && <small>Depends on: {step.dependsOn.map((slug) => workers.find((item) => item.slug === slug)?.name || slug).join(", ")}</small>}</div></div>; })}</div>
        <div className="planProductSummary"><b>{run?.productInput?.name}</b><span>{run?.goal?.objective}</span><span>{run?.selectedWorkers?.length} selected workers · plan awaits your approval</span></div>
        <div className="agentActions"><button className="agentSecondary" onClick={() => setMode("form")}><ArrowLeft size={15}/> Edit product or workers</button><button className="primary" disabled={busy} onClick={startRun}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} Approve plan and run Agent</button></div>
      </section>}

      {(mode === "running" || mode === "failed") && <section className="panel runProgress">
        <div className="agentSectionHead"><span className="agentIcon"><Bot size={17}/></span><div><h2>{mode === "failed" ? "Agent run stopped" : "Agent is working…"}</h2><p>{mode === "failed" ? run?.errorMessage || "The run could not be completed." : "Workers are executing in the reviewed order. Results inform later workers."}</p></div>{mode === "running" && <LoaderCircle className="spin progressSpinner" size={20}/>}</div>
        <div className="planTimeline">{plan?.steps?.map((step) => { const state = run?.steps?.find((item) => item.workerSlug === step.workerSlug); const done = completed.has(step.workerSlug); const working = state?.status === "RUNNING"; return <div className="planItem runItem" key={step.workerSlug}><span className={done ? "runCheck done" : working ? "runCheck working" : "runCheck"}>{done ? <Check size={14}/> : working ? <LoaderCircle className="spin" size={14}/> : <Circle size={14}/>}</span><div><strong>{workers.find((item) => item.slug === step.workerSlug)?.name || step.workerSlug}</strong><p>{working ? "Generating and evaluating output…" : state?.status === "FAILED" ? state.errorMessage : done ? "Completed" : "Waiting"}</p>{state?.retryCount > 0 && <small>Retried {state.retryCount} time</small>}</div></div>; })}</div>
        {mode === "failed" && <div className="agentActions"><button className="agentSecondary" onClick={reset}>Start another run</button></div>}
      </section>}

      {mode === "result" && <section className="agentResultLayout">
        <div className="panel finalSummary"><p className="eyebrow">FINAL MARKETING OUTPUT</p><h2>{run?.productInput?.name} · {run?.goal?.objective}</h2><p>{output?.executiveSummary}</p><h3>Next actions</h3><ol>{output?.nextActions?.map((action, index) => <li key={index}>{action}</li>)}</ol></div>
        <div className="panel"><div className="agentSectionHead"><span className="agentIcon"><Check size={17}/></span><div><h2>Completed worker outputs</h2><p>{output?.workerOutputs?.length || 0} approved workers completed.</p></div></div>
          {(output?.workerOutputs || []).map((item) => <article className="agentOutputCard" key={item.workerSlug}><div><span className="workerTier">{item.workerName}</span><h3>{item.output.summary}</h3></div><div className="agentRecommendations">{item.output.recommendations?.map((rec, index) => <div key={index}><strong>{rec.title || `Recommendation ${index + 1}`}</strong><p>{rec.detail || JSON.stringify(rec)}</p></div>)}</div></article>)}
          {!!output?.assumptions?.length && <div className="assumptionBox"><strong>Assumptions</strong><ul>{output.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        </div>
      </section>}

      <section className="agentHistory"><div className="sectionTitle"><div><h2>Recent Agent runs</h2><p>Plans and results saved to your account.</p></div></div><div className="agentHistoryList">{history.slice(0, 5).map((item) => <button key={item.id} className="agentHistoryItem" onClick={() => loadHistory(item.id)}><span><strong>{item.productInput?.name || "Marketing run"}</strong><small>{item.goal?.objective || item.goal}</small></span><span className={`status ${item.status === "SUCCEEDED" ? "succeeded" : item.status === "FAILED" ? "failed" : "pending"}`}>{item.status.toLowerCase().replaceAll("_", " ")}</span><ArrowRight size={15}/></button>)}</div></section>
    </div>
  );
}
