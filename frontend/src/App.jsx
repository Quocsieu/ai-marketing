import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  History,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Sparkles,
  ArrowUpRight,
  LoaderCircle,
  Save,
  Play,
} from "lucide-react";
import AgentPage from "./pages/AgentPage";
const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json.data;
}
function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (token)
      request("/auth/me")
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("token");
          setToken(null);
        });
  }, [token]);
  if (!token)
    return (
      <Auth
        onLogin={(t) => {
          localStorage.setItem("token", t);
          setToken(t);
        }}
      />
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandIcon">
            <Sparkles size={19} />
          </span>{" "}
          MarketPilot<span className="brandAI">AI</span>
        </div>
        <div className="workspace">WORKSPACE</div>
        <nav>
          <Nav to="/" icon={<LayoutDashboard size={18} />} label="Overview" />
          <Nav
            to="/context"
            icon={<Users size={18} />}
            label="Marketing context"
          />
          <Nav
            to="/agent"
            icon={<Bot size={18} />}
            label="AI Marketing Agent"
          />
          <Nav
            to="/workers"
            icon={<BriefcaseBusiness size={18} />}
            label="AI workers"
          />
          <Nav
            to="/history"
            icon={<History size={18} />}
            label="Execution history"
          />
          <Nav
            to="/analytics"
            icon={<ChartNoAxesCombined size={18} />}
            label="Analytics"
          />
          <Nav to="/settings" icon={<Settings size={18} />} label="Settings" />
        </nav>
        <div className="sideBottom">
          <div className="planMini">
            <div className="planDot" />
            M1 Starter <ArrowUpRight size={14} />
          </div>
          <button
            className="logout"
            onClick={() => {
              localStorage.removeItem("token");
              setToken(null);
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="crumb">Workspace</span>
            <span className="slash"> / </span>
            <span>Marketing overview</span>
          </div>
          <div className="profile">
            <div className="avatar">
              {user?.name?.[0]?.toUpperCase() || "M"}
            </div>
            <div>
              <strong>{user?.name || "Welcome"}</strong>
              <small>Workspace admin</small>
            </div>
          </div>
        </header>
        {error && <div className="error">{error}</div>}
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/agent" element={<AgentPage request={request} />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/:slug" element={<Worker />} />
          <Route path="/context" element={<Context />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
function Nav({ to, icon, label }) {
  return (
    <Link className="navLink" to={to}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await request("/auth/" + mode, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" ? { name } : {}),
        }),
      });
      onLogin(d.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <div className="authCard">
        <div className="brand">
          <span className="brandIcon">
            <Sparkles size={19} />
          </span>{" "}
          MarketPilot<span className="brandAI">AI</span>
        </div>
        <p className="eyebrow">YOUR AI MARKETING TEAM</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
        <p className="muted">
          Strategy and useful marketing outputs, in one place.
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength="8"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : null}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="switch">
          {mode === "login"
            ? "New to MarketPilot?"
            : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
      <span className="authFoot">
        Practical AI for clearer marketing decisions
      </span>
    </div>
  );
}
function Heading({ eyebrow, title, sub, action }) {
  return (
    <div className="heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}
function Overview() {
  const [data, setData] = useState(null),
    [sub, setSub] = useState(null),
    [workers, setWorkers] = useState([]);
  useEffect(() => {
    request("/analytics").then(setData);
    request("/packages/subscription").then(setSub);
    request("/workers").then(setWorkers);
  }, []);
  return (
    <>
      <Heading
        eyebrow="MONDAY, YOUR WORKSPACE"
        title="Good marketing starts with context."
        sub="Plan, create, and improve your next campaign with your AI workers."
        action={
          <Link className="primary" to="/workers">
            <Sparkles size={16} /> Explore workers
          </Link>
        }
      />
      <div className="hero">
        <div className="heroCopy">
          <div className="heroTag">
            <Sparkles size={14} /> YOUR AI MARKETING WORKSPACE
          </div>
          <h2>
            Turn your next idea
            <br />
            into a <em>clear action plan.</em>
          </h2>
          <p>
            Bring your business context into one place, then get focused support
            from your marketing workers.
          </p>
          <Link to="/context" className="heroButton">
            Set up marketing context <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="heroArt">
          <div className="artCircle">
            <div className="artCore">
              <Sparkles size={28} />
            </div>
            <div className="artOrbit orbit1" />
            <div className="artOrbit orbit2" />
            <span className="floatCard fc1">? Audience insight</span>
            <span className="floatCard fc2">? Campaign plan</span>
            <span className="floatCard fc3">? Brand voice</span>
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat label="Executions" value={data?.total ?? "�"} note="All time" />
        <Stat
          label="Successful runs"
          value={data?.succeeded ?? "�"}
          note="Completed outputs"
        />
        <Stat
          label="Available workers"
          value={workers.filter((w) => w.available).length || "�"}
          note="Included in your plan"
        />
        <Stat
          label="Current plan"
          value={sub?.package?.code || "�"}
          note={sub?.package?.name || "Set up subscription"}
        />
      </div>
      <div className="sectionTitle">
        <div>
          <h2>Start with a worker</h2>
          <p>Focused help for your next marketing decision.</p>
        </div>
        <Link to="/workers" className="textLink">
          View all workers <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="workerGrid">
        {workers
          .filter((w) => w.available)
          .slice(0, 3)
          .map((w) => (
            <WorkerCard key={w.slug} w={w} />
          ))}
      </div>
      <div className="callout">
        <div className="calloutIcon">
          <Users size={19} />
        </div>
        <div>
          <strong>Give every worker the right context</strong>
          <p>
            Add your product, audience, and goals once. Your workers can use it
            in every session.
          </p>
        </div>
        <Link to="/context">
          Complete context <ArrowUpRight size={15} />
        </Link>
      </div>
    </>
  );
}
function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function WorkerCard({ w }) {
  return (
    <Link className="workerCard" to={"/workers/" + w.slug}>
      <div className="workerIcon">
        <Sparkles size={18} />
      </div>
      <span className="pill">{w.requiredPackage}</span>
      <h3>{w.name}</h3>
      <p>{w.description}</p>
      <span className="cardLink">
        Open worker <ArrowUpRight size={14} />
      </span>
    </Link>
  );
}
function Workers() {
  const [list, setList] = useState([]),
    [filter, setFilter] = useState("All");
  useEffect(() => {
    request("/workers").then(setList);
  }, []);
  const shown = list.filter(
    (w) => filter === "All" || w.requiredPackage === filter,
  );
  return (
    <>
      <Heading
        eyebrow="YOUR TOOLKIT"
        title="AI workers"
        sub="Specialized support for strategy, campaigns, content, and growth."
      />
      <div className="filters">
        {["All", "M1", "M2", "M3", "M4"].map((x) => (
          <button
            className={filter === x ? "selected" : ""}
            onClick={() => setFilter(x)}
            key={x}
          >
            {x === "All" ? "All workers" : x}
          </button>
        ))}
      </div>
      <div className="workerGrid">
        {shown.map((w) => (
          <div className={!w.available ? "locked" : ""} key={w.slug}>
            {w.available ? (
              <WorkerCard w={w} />
            ) : (
              <div className="workerCard">
                <div className="workerIcon">
                  <Sparkles size={18} />
                </div>
                <span className="pill">
                  {w.requiredPackage} � Upgrade required
                </span>
                <h3>{w.name}</h3>
                <p>{w.description}</p>
                <span className="muted">Not included in current package</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
function Worker() {
  const { slug } = useParams();
  const [w, setW] = useState(null),
    [objective, setObjective] = useState(""),
    [audience, setAudience] = useState(""),
    [constraints, setConstraints] = useState(""),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/workers").then((a) => setW(a.find((x) => x.slug === slug)));
  }, [slug]);
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const d = await request(`/workers/${slug}/execute`, {
        method: "POST",
        body: JSON.stringify({ objective, audience, constraints }),
      });
      setResult(d.execution.result.output);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!w) return <p>Loading worker�</p>;
  return (
    <>
      <Heading
        eyebrow={`${w.requiredPackage} WORKER`}
        title={w.name}
        sub={w.description}
      />
      <div className="executionLayout">
        <section className="panel">
          <h2>Build your brief</h2>
          <p className="muted">
            Your saved marketing context will be included automatically.
          </p>
          <form onSubmit={run}>
            <label>
              What are you working on?
              <textarea
                required
                minLength="3"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Describe your goal or the challenge you want to solve"
              />
            </label>
            <label>
              Target audience
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Constraints or additional detail
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="Optional"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy || !w.available}>
              {busy ? <LoaderCircle className="spin" /> : <Play size={16} />}{" "}
              {busy ? "Generating�" : "Generate recommendations"}
            </button>
          </form>
        </section>
        <section className="panel resultPanel">
          <div className="resultHeading">
            <div>
              <p className="eyebrow">WORKER OUTPUT</p>
              <h2>Your result</h2>
            </div>
            <Sparkles size={19} />
          </div>
          {result ? (
            <>
              <p>{result.summary}</p>
              <h3>Recommendations</h3>
              {result.recommendations.map((r, i) => (
                <div className="recommendation" key={i}>
                  <b>{r.title || `Recommendation ${i + 1}`}</b>
                  <p>{r.detail || JSON.stringify(r)}</p>
                </div>
              ))}
              <h3>Assumptions</h3>
              <ul>
                {result.assumptions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="emptyResult">
              <div className="emptyIcon">
                <Sparkles size={22} />
              </div>
              <strong>Nothing generated yet</strong>
              <span>
                Complete the brief and run your worker to see structured
                recommendations here.
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function Context() {
  const [data, setData] = useState({
      businessName: "",
      brandDescription: "",
      productService: "",
      productPrice: "",
      targetMarket: "",
      targetCustomer: "",
      brandVoice: "",
      brandTone: "",
      businessGoals: "",
      marketingGoals: "",
      uniqueSellingPoints: "",
      competitors: [],
      location: "",
      industry: "",
      website: "",
      additionalNotes: "",
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/marketing-context").then(
      (x) =>
        x &&
        setData({
          ...data,
          ...x,
          competitors: Array.isArray(x.competitors)
            ? x.competitors.join(", ")
            : "",
        }),
    );
  }, []);
  const fields = [
    ["businessName", "Business name"],
    ["brandDescription", "Brand description"],
    ["productService", "Product or service"],
    ["productPrice", "Price"],
    ["targetMarket", "Target market"],
    ["targetCustomer", "Target customer"],
    ["brandVoice", "Brand voice"],
    ["brandTone", "Brand tone"],
    ["businessGoals", "Business goals"],
    ["marketingGoals", "Marketing goals"],
    ["uniqueSellingPoints", "Unique selling points"],
    ["competitors", "Competitors (comma separated)"],
    ["location", "Location"],
    ["industry", "Industry"],
    ["website", "Website"],
    ["additionalNotes", "Additional notes"],
  ];
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await request("/marketing-context", {
        method: "PUT",
        body: JSON.stringify({
          ...data,
          competitors:
            typeof data.competitors === "string"
              ? data.competitors
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
              : data.competitors,
        }),
      });
      setMessage(
        "Marketing context saved. Workers will use it in future runs.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="YOUR BRAND FOUNDATION"
        title="Marketing context"
        sub="Share the details workers need. Add it once and reuse it across your work."
      />
      <form className="panel contextForm" onSubmit={save}>
        <div className="formGrid">
          {fields.map(([key, label]) => (
            <label
              key={key}
              className={
                [
                  "brandDescription",
                  "targetMarket",
                  "targetCustomer",
                  "businessGoals",
                  "marketingGoals",
                  "uniqueSellingPoints",
                  "additionalNotes",
                ].includes(key)
                  ? "wide"
                  : ""
              }
            >
              {label}
              {[
                "brandDescription",
                "targetMarket",
                "targetCustomer",
                "businessGoals",
                "marketingGoals",
                "uniqueSellingPoints",
                "additionalNotes",
              ].includes(key) ? (
                <textarea
                  value={data[key] || ""}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                />
              ) : (
                <input
                  required={key === "businessName"}
                  value={
                    Array.isArray(data[key])
                      ? data[key].join(", ")
                      : data[key] || ""
                  }
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        <div className="saveRow">
          {message && (
            <span className={message.includes("saved") ? "success" : "error"}>
              {message}
            </span>
          )}
          <button className="primary" disabled={busy}>
            <Save size={16} />
            {busy ? "Saving" : "Save marketing context"}
          </button>
        </div>
      </form>
    </>
  );
}
function HistoryPage() {
  const [list, setList] = useState([]);
  useEffect(() => {
    request("/workers/executions").then(setList);
  }, []);
  return (
    <>
      <Heading
        eyebrow="YOUR ACTIVITY"
        title="Execution history"
        sub="Review outputs generated by your marketing workers."
      />
      <div className="panel tablePanel">
        <div className="tableHead">
          <span>WORKER</span>
          <span>STATUS</span>
          <span>DATE</span>
          <span>DURATION</span>
        </div>
        {list.length ? (
          list.map((x) => (
            <div className="tableRow" key={x.id}>
              <strong>{x.workerSlug.replaceAll("-", " ")}</strong>
              <span className={"status " + x.status.toLowerCase()}>
                {x.status.toLowerCase()}
              </span>
              <span>{new Date(x.createdAt).toLocaleString()}</span>
              <span>{x.durationMs ? `${x.durationMs} ms` : "�"}</span>
            </div>
          ))
        ) : (
          <div className="emptyResult">
            No executions yet. Run a worker to see activity here.
          </div>
        )}
      </div>
    </>
  );
}
function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => {
    request("/analytics").then(setData);
  }, []);
  return (
    <>
      <Heading
        eyebrow="WORKSPACE HEALTH"
        title="Analytics"
        sub="Internal worker activity only. External campaign metrics are not connected."
      />
      <div className="stats analyticsStats">
        <Stat
          label="Total executions"
          value={data?.total ?? "�"}
          note="All time"
        />
        <Stat
          label="Successful"
          value={data?.succeeded ?? "�"}
          note="Generated results"
        />
        <Stat
          label="Failed"
          value={data?.failed ?? "�"}
          note="Runs needing attention"
        />
        <Stat
          label="Recent activity"
          value={data?.recent?.length ?? "�"}
          note="Latest 10 runs"
        />
      </div>
      <div className="panel">
        <h2>Recent activity</h2>
        {data?.recent?.map((x) => (
          <div className="activityRow" key={x.id}>
            <span className="workerIcon">
              <Sparkles size={15} />
            </span>
            <b>{x.workerSlug.replaceAll("-", " ")}</b>
            <span className={"status " + x.status.toLowerCase()}>
              {x.status.toLowerCase()}
            </span>
            <small>{x.durationMs ? `${x.durationMs} ms` : ""}</small>
          </div>
        ))}
      </div>
    </>
  );
}
function SettingsPage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    request("/packages/subscription").then(setData);
  }, []);
  return (
    <>
      <Heading
        eyebrow="ACCOUNT"
        title="Settings"
        sub="Your package and workspace configuration."
      />
      <div className="panel planPanel">
        <div>
          <p className="eyebrow">CURRENT SUBSCRIPTION</p>
          <h2>{data?.package?.name || "No active plan"}</h2>
          <p className="muted">
            {data?.package?.priceVnd
              ? new Intl.NumberFormat("vi-VN").format(data.package.priceVnd) +
                " ? / month"
              : "Custom pricing"}{" "}
            � {data?.status || "�"}
          </p>
        </div>
        <span className="planBadge">{data?.package?.code || "�"}</span>
      </div>
      <p className="muted note">
        Package changes are currently a development activation flow. No payment
        is taken.
      </p>
    </>
  );
}
export default App;
