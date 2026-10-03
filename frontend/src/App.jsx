import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useParams } from "react-router-dom";
import {
  Users,
  Sparkles,
  ArrowUpRight,
  LoaderCircle,
  Save,
  Play,
  Eye,
  EyeOff,
} from "lucide-react";
import AgentPage from "./pages/AgentPage";
import { workerDescription, workerName } from "./utils/workerPresentation";
import MetaAdsSettings from "./components/MetaAdsSettings";
import AppLayout from "./components/layout/AppLayout";
import AdsCenter from "./pages/ads/AdsCenter";
import { EmptyState, Spinner, Table } from "./components/ui";
const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
async function request(path, options = {}) {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token && (path === "/auth/me" || !path.startsWith("/auth/"))) {
    localStorage.removeItem("accessToken"); localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  if (!res.ok) throw new Error(localizeApiError(path, json, res.status));
  return json.data;
}
function localizeApiError(path, payload, status) {
  if (path === "/auth/login") return "Email hoặc mật khẩu chưa chính xác.";
  if (path === "/auth/register" && (status === 409 || payload.code === "P2002")) return "Email này đã được đăng ký. Hãy đăng nhập hoặc sử dụng email khác.";
  if (payload.code === "PACKAGE_CAPABILITY_REQUIRED" || payload.code === "SUBSCRIPTION_REQUIRED") return "Gói hiện tại chưa hỗ trợ Worker này. Hãy kiểm tra gói dịch vụ của bạn.";
  if (payload.code === "META_NOT_CONFIGURED") return "Meta Ads chưa được cấu hình trên máy chủ. Hãy liên hệ quản trị viên.";
  if (["META_REAUTH_REQUIRED", "META_NOT_CONNECTED"].includes(payload.code)) return "Hãy kết nối lại tài khoản Meta trong Cài đặt.";
  if (["META_AD_ACCOUNT_REQUIRED", "META_AD_ACCOUNT_FORBIDDEN", "META_PAGE_FORBIDDEN"].includes(payload.code)) return "Hãy chọn tài khoản quảng cáo hoặc Page mà tài khoản Meta của bạn có quyền truy cập.";
  if (payload.code === "META_CAMPAIGN_RESULT_UNKNOWN") return "Meta chưa xác nhận campaign đã tạo hay chưa. Kiểm tra Ads Manager trước khi thử lại.";
  if (String(payload.code || "").startsWith("META_")) return "Không thể hoàn tất yêu cầu Meta Ads. Hãy kiểm tra quyền truy cập rồi thử lại.";
  if (["AI_PROVIDER_NOT_CONFIGURED", "AI_MODEL_NOT_CONFIGURED", "AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_ERROR"].includes(payload.code)) return "Dịch vụ AI hiện chưa sẵn sàng. Vui lòng thử lại sau.";
  if (["AGENT_INVALID_PLAN", "AGENT_INVALID_DECISION", "AGENT_RETRY_LIMIT"].includes(payload.code)) return "Agent chưa thể hoàn thành lượt chạy này. Hãy tạo kế hoạch mới rồi thử lại.";
  if (status === 400) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường đã nhập.";
  return status >= 500 ? "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau." : "Yêu cầu chưa thực hiện được. Vui lòng thử lại.";
}
function App() {
  const [token, setToken] = useState(localStorage.getItem("accessToken") || localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  useEffect(() => {
    const expire = () => { setToken(null); setUser(null); setAuthNotice("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); };
    window.addEventListener("auth:expired", expire);
    return () => window.removeEventListener("auth:expired", expire);
  }, []);
  useEffect(() => {
    if (token)
      request("/auth/me")
        .then(setUser)
        .catch(() => {});
  }, [token]);
  if (!token)
    return (
      <Auth
        notice={authNotice}
        onLogin={(t) => {
          localStorage.setItem("accessToken", t); localStorage.removeItem("token"); setAuthNotice(""); setUser(null);
          setToken(t);
        }}
      />
    );
  return (
    <AppLayout user={user} onLogout={() => {
      localStorage.removeItem("accessToken"); localStorage.removeItem("token"); setUser(null);
      setToken(null);
    }}>
        {error && <div className="error">{error}</div>}
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/agent" element={<AgentPage request={request} />} />
          <Route path="/agent/runs/:runId" element={<AgentPage request={request} />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/:slug" element={<Worker />} />
          <Route path="/context" element={<Context />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage request={request} />} />
          <Route path="/meta-ads" element={<AdsCenter request={request} />} />

        </Routes>
    </AppLayout>
  );
}
function statusLabel(status) {
  return ({ SUCCEEDED: "Thành công", SUCCESS: "Thành công", RUNNING: "Đang thực hiện", PENDING: "Chờ thực hiện", FAILED: "Thất bại", CANCELLED: "Đã hủy", RETRY: "Đang thử lại", PLANNING: "Đang lập kế hoạch", AWAITING_APPROVAL: "Chờ duyệt", ACTIVE: "Đang hoạt động", INACTIVE: "Không hoạt động", EXPIRED: "Đã hết hạn" })[status] || status;
}
function Auth({ onLogin, notice = "" }) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [showConfirm, setShowConfirm] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (mode === "register" && password !== confirmPassword) { setBusy(false); setError("Mật khẩu xác nhận chưa khớp."); return; }
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
        <p className="eyebrow">ĐỘI NGŨ MARKETING AI CỦA BẠN</p>
        <h1>{mode === "login" ? "Chào mừng bạn trở lại" : "Tạo không gian làm việc"}</h1>
        <p className="muted">
          Lập kế hoạch và tạo nội dung marketing hữu ích tại một nơi.
        </p>
        {notice && <div className="success">{notice}</div>}
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Họ và tên
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
              Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
              Mật khẩu
              <span className="passwordControl"><input type={showPassword ? "text" : "password"} minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required/><button type="button" className="passwordToggle" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {mode === "register" && <label>Xác nhận mật khẩu<span className="passwordControl"><input type={showConfirm ? "text" : "password"} minLength="8" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required/><button type="button" className="passwordToggle" aria-label={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>}
          {error && <div className="error">{error}</div>}
          <button className="primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : null}
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>
        <p className="switch">
          {mode === "login"
            ? "Chưa có tài khoản?"
            : "Đã có tài khoản?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Đăng ký" : "Đăng nhập"}
          </button>
        </p>
      </div>
      <span className="authFoot">
        AI thiết thực cho quyết định marketing rõ ràng hơn
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
    request("/analytics").then(setData).catch(() => {});
    request("/packages/subscription").then(setSub).catch(() => {});
    request("/workers").then(setWorkers).catch(() => {});
  }, []);
  return (
    <>
      <Heading
        eyebrow="TỔNG QUAN"
        title="Theo dõi hoạt động marketing của bạn"
        sub="Lập kế hoạch, sáng tạo và cải thiện chiến dịch cùng các Worker AI."
        action={
          <Link className="primary" to="/workers">
            <Sparkles size={16} /> Khám phá Worker
          </Link>
        }
      />
      <div className="hero">
        <div className="heroCopy">
          <div className="heroTag">
            <Sparkles size={14} /> KHÔNG GIAN MARKETING AI
          </div>
          <h2>
            Biến ý tưởng tiếp theo
            <br />
            thành <em>kế hoạch hành động rõ ràng.</em>
          </h2>
          <p>
            Tập hợp thông tin doanh nghiệp tại một nơi và nhận hỗ trợ phù hợp từ các Worker marketing.
          </p>
          <Link to="/context" className="heroButton">
            Thiết lập ngữ cảnh marketing <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="heroArt">
          <div className="artCircle">
            <div className="artCore">
              <Sparkles size={28} />
            </div>
            <div className="artOrbit orbit1" />
            <div className="artOrbit orbit2" />
            <span className="floatCard fc1">✦ Thấu hiểu khách hàng</span>
            <span className="floatCard fc2">✦ Kế hoạch chiến dịch</span>
            <span className="floatCard fc3">? Giọng điệu thương hiệu</span>
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat label="Lượt thực thi" value={data?.total ?? "—"} note="Tất cả thời gian" />
        <Stat
          label="Lượt chạy thành công"
          value={data?.succeeded ?? "—"}
          note="Kết quả đã hoàn tất"
        />
        <Stat
          label="Worker khả dụng"
          value={workers.filter((w) => w.available).length}
          note="Có trong gói của bạn"
        />
        <Stat
          label="Gói hiện tại"
          value={sub?.package?.code || "—"}
          note={sub?.package?.name || "Thiết lập gói dịch vụ"}
        />
      </div>
      <div className="sectionTitle">
        <div>
          <h2>Bắt đầu với một Worker</h2>
          <p>Hỗ trợ tập trung cho quyết định marketing tiếp theo.</p>
        </div>
        <Link to="/workers" className="textLink">
          Xem tất cả Worker <ArrowUpRight size={15} />
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
      <section className="overview-activity">
        <div className="sectionTitle">
          <div><h2>Hoạt động gần đây</h2><p>Các lượt chạy AI mới nhất trong không gian làm việc.</p></div>
          <Link to="/history" className="textLink">Xem lịch sử <ArrowUpRight size={15} /></Link>
        </div>
        {data?.recent?.length ? <Table columns={[
          { key: "worker", label: "Worker" },
          { key: "status", label: "Trạng thái", render: (value, row) => <span className={`status ${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span> },
          { key: "createdAt", label: "Thời gian" },
        ]} data={data.recent.slice(0, 5).map((item) => ({ id: item.id, worker: item.workerSlug.replaceAll("-", " "), status: item.status, createdAt: new Date(item.createdAt).toLocaleString("vi-VN") }))} /> : <EmptyState title="Chưa có hoạt động gần đây" description="Lượt chạy Worker sẽ xuất hiện sau khi bạn tạo đề xuất đầu tiên." />}
      </section>
      <div className="callout">
        <div className="calloutIcon">
          <Users size={19} />
        </div>
        <div>
          <strong>Cung cấp đúng ngữ cảnh cho Worker</strong>
          <p>
            Thêm sản phẩm, khách hàng mục tiêu và mục tiêu kinh doanh một lần để Worker sử dụng trong các lượt làm việc.
          </p>
        </div>
        <Link to="/context">
          Hoàn tất ngữ cảnh <ArrowUpRight size={15} />
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
      <h3>{workerName(w)}</h3>
      <p>{workerDescription(w)}</p>
      <span className="cardLink">
        Mở Worker <ArrowUpRight size={14} />
      </span>
    </Link>
  );
}
function Workers() {
  const [list, setList] = useState([]),
    [filter, setFilter] = useState("All"), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    request("/workers").then(setList).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const shown = list.filter(
    (w) => filter === "All" || w.requiredPackage === filter,
  );
  return (
    <>
      <Heading
        eyebrow="BỘ CÔNG CỤ CỦA BẠN"
        title="Worker AI"
        sub="Hỗ trợ chuyên sâu về chiến lược, chiến dịch, nội dung và tăng trưởng."
      />
      <div className="filters">
        {["All", "M1", "M2", "M3", "M4"].map((x) => (
          <button
            className={filter === x ? "selected" : ""}
            onClick={() => setFilter(x)}
            key={x}
          >
            {x === "All" ? "Tất cả Worker" : x}
          </button>
        ))}
      </div>
      {error ? <div className="error" role="alert">{error}</div> : loading ? <div className="page-loading"><Spinner /> <span>Đang tải danh sách Worker…</span></div> : shown.length ? <div className="workerGrid">
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
                  {w.requiredPackage} — Cần nâng cấp gói
                </span>
                <h3>{workerName(w)}</h3>
                <p>{workerDescription(w)}</p>
                <span className="muted">Không có trong gói hiện tại</span>
              </div>
            )}
          </div>
        ))}
      </div> : <EmptyState title="Không tìm thấy Worker" description="Thử chọn một gói khác để xem các Worker hiện có." />}
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
    request("/workers").then((a) => setW(a.find((x) => x.slug === slug))).catch(() => {});
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
  if (!w) return <p>Đang tải Worker—</p>;
  return (
    <>
      <Heading
        eyebrow={`${w.requiredPackage} WORKER`}
        title={workerName(w)}
        sub={workerDescription(w)}
      />
      <div className="executionLayout">
        <section className="panel">
          <h2>Tạo bản mô tả</h2>
          <p className="muted">
            Ngữ cảnh marketing đã lưu sẽ được tự động sử dụng.
          </p>
          <form onSubmit={run}>
            <label>
              Bạn đang cần thực hiện việc gì?
              <textarea
                required
                minLength="3"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Mô tả mục tiêu hoặc vấn đề bạn muốn giải quyết"
              />
            </label>
            <label>
              Đối tượng mục tiêu
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Không bắt buộc"
              />
            </label>
            <label>
              Điều kiện hoặc thông tin bổ sung
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="Không bắt buộc"
              />
            </label>
          {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy || !w.available}>
              {busy ? <LoaderCircle className="spin" /> : <Play size={16} />}{" "}
              {busy ? "Đang tạo—" : "Tạo đề xuất"}
            </button>
          </form>
        </section>
        <section className="panel resultPanel">
          <div className="resultHeading">
            <div>
              <p className="eyebrow">KẾT QUẢ WORKER</p>
              <h2>Kết quả của bạn</h2>
            </div>
            <Sparkles size={19} />
          </div>
          <div className="aiOutput">{result ? (
            <>
              <p>{result.summary}</p>
              <h3>Đề xuất</h3>
              {result.recommendations.map((r, i) => (
                <div className="recommendation" key={i}>
                  <b>{r.title || `Đề xuất ${i + 1}`}</b>
                  <p>{r.detail || ""}</p>
                </div>
              ))}
              <h3>Giả định</h3>
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
              <strong>Chưa có kết quả</strong>
              <span>
                Hoàn thành bản mô tả và chạy Worker để xem các đề xuất tại đây.
              </span>
            </div>
          )}</div>
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
    ).catch(() => {});
  }, []);
  const fields = [
    ["businessName", "Tên doanh nghiệp"],
    ["industry", "Ngành hàng"],
    ["location", "Địa điểm"],
    ["website", "Trang web"],
    ["productService", "Sản phẩm hoặc dịch vụ"],
    ["productPrice", "Giá"],
    ["uniqueSellingPoints", "Điểm bán hàng nổi bật"],
    ["targetMarket", "Thị trường mục tiêu"],
    ["targetCustomer", "Khách hàng mục tiêu"],
    ["brandDescription", "Mô tả thương hiệu"],
    ["brandVoice", "Giọng điệu thương hiệu"],
    ["brandTone", "Sắc thái thương hiệu"],
    ["businessGoals", "Mục tiêu kinh doanh"],
    ["marketingGoals", "Mục tiêu marketing"],
    ["competitors", "Đối thủ cạnh tranh (phân tách bằng dấu phẩy)"],
    ["additionalNotes", "Ghi chú bổ sung"],
  ];
  const sectionStarts = { businessName: "Doanh nghiệp", productService: "Sản phẩm", targetMarket: "Khách hàng", brandDescription: "Thương hiệu", businessGoals: "Mục tiêu marketing" };
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
        "Đã lưu ngữ cảnh marketing. Worker sẽ sử dụng thông tin này trong các lượt chạy sau.",
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
        eyebrow="NỀN TẢNG THƯƠNG HIỆU"
        title="Ngữ cảnh marketing"
        sub="Chia sẻ thông tin cần thiết để Worker sử dụng xuyên suốt công việc."
      />
      <form className="panel contextForm" onSubmit={save}>
        <div className="formGrid">
          {fields.map(([key, label]) => (
            <React.Fragment key={key}>
            {sectionStarts[key] && <h2 className="context-section-title">{sectionStarts[key]}</h2>}
            <label
              className={["brandDescription", "targetMarket", "targetCustomer", "businessGoals", "marketingGoals", "uniqueSellingPoints", "additionalNotes"].includes(key) ? "wide" : ""}
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
                <>
                  {key === "marketingGoals" && <div className="quickChoices">{["Tăng nhận diện", "Tăng tương tác", "Tăng lưu lượng truy cập", "Tăng chuyển đổi", "Tăng doanh số"].map((choice) => { const values = (data.marketingGoals || "").split(", ").filter(Boolean); const active = values.includes(choice); return <button type="button" className={active ? "quickChoice selected" : "quickChoice"} key={choice} onClick={() => setData({ ...data, marketingGoals: (active ? values.filter((item) => item !== choice) : [...values, choice]).join(", ") })}>{choice}</button>; })}</div>}
                  {key === "targetMarket" && <div className="quickChoices">{["13–17", "18–24", "25–34", "35–44", "45+", "Khác"].map((choice) => <button type="button" className="quickChoice" key={choice} onClick={() => setData({ ...data, targetMarket: [data.targetMarket, choice].filter(Boolean).join(", ") })}>{choice}</button>)}</div>}
                  <textarea
                  value={data[key] || ""}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                  />
                </>
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
            </React.Fragment>
          ))}
        </div>
        <div className="saveRow">
          {message && (
            <span className={message.startsWith("Đã lưu") ? "success" : "error"}>
              {message}
            </span>
          )}
          <button className="primary" disabled={busy}>
            <Save size={16} />
            {busy ? "Đang lưu…" : "Lưu ngữ cảnh marketing"}
          </button>
        </div>
      </form>
    </>
  );
}
function HistoryPage() {
  const [list, setList] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    request("/workers/executions").then(setList).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const columns = [
    { key: "worker", label: "Worker" },
    { key: "status", label: "Trạng thái", render: (value, row) => <span className={`status ${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span> },
    { key: "createdAt", label: "Thời gian" },
    { key: "duration", label: "Thời lượng" },
  ];
  const rows = list.map((item) => ({
    id: item.id,
    worker: item.workerSlug.replaceAll("-", " "),
    status: item.status,
    createdAt: new Date(item.createdAt).toLocaleString("vi-VN"),
    duration: item.durationMs ? `${item.durationMs} ms` : "Chưa có dữ liệu",
  }));
  return (
    <>
      <Heading
        eyebrow="HOẠT ĐỘNG CỦA BẠN"
        title="Lịch sử thực thi"
        sub="Xem lại kết quả do các Worker marketing tạo ra."
      />
      {error ? <div className="error" role="alert">{error}</div> : loading ? <div className="page-loading"><Spinner /> <span>Đang tải lịch sử thực thi…</span></div> : rows.length ? <Table className="history-table" columns={columns} data={rows} /> : <EmptyState title="Chưa có lượt thực thi" description="Chạy Worker để xem hoạt động và kết quả tại đây." />}
    </>
  );
}
function Analytics() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    request("/analytics").then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <>
      <Heading
        eyebrow="TÌNH TRẠNG KHÔNG GIAN LÀM VIỆC"
        title="Phân tích"
        sub="Thống kê hoạt động Worker nội bộ. Chưa kết nối số liệu chiến dịch bên ngoài."
      />
      <div className="stats analyticsStats">
        <Stat
          label="Tổng lượt thực thi"
          value={data?.total ?? "—"}
          note="Tất cả thời gian"
        />
        <Stat
          label="Thành công"
          value={data?.succeeded ?? "—"}
          note="Kết quả đã tạo"
        />
        <Stat
          label="Thất bại"
          value={data?.failed ?? "—"}
          note="Lượt chạy cần được xem lại"
        />
        <Stat
          label="Hoạt động gần đây"
          value={data?.recent?.length ?? "—"}
          note="10 lượt chạy gần đây"
        />
      </div>
      <section className="analytics-activity">
        <h2>Hoạt động gần đây</h2>
        {error ? <div className="error" role="alert">{error}</div> : loading ? <div className="page-loading"><Spinner /> <span>Đang tải phân tích…</span></div> : data?.recent?.length ? <Table columns={[
          { key: "worker", label: "Worker" },
          { key: "status", label: "Trạng thái", render: (value, row) => <span className={`status ${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span> },
          { key: "duration", label: "Thời lượng" },
        ]} data={data.recent.map((item) => ({ id: item.id, worker: item.workerSlug.replaceAll("-", " "), status: item.status, duration: item.durationMs ? `${item.durationMs} ms` : "Chưa có dữ liệu" }))} /> : <EmptyState title="Chưa có hoạt động gần đây" description="Các lượt thực thi Worker sẽ xuất hiện tại đây." />}
      </section>
    </>
  );
}
function SettingsPage({ request }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    request("/packages/subscription").then(setData).catch(() => {});
  }, []);
  return (
    <>
      <Heading
        eyebrow="TÀI KHOẢN"
        title="Cài đặt"
        sub="Gói dịch vụ và cấu hình không gian làm việc của bạn."
      />
      <div className="panel planPanel">
        <div>
          <p className="eyebrow">GÓI DỊCH VỤ HIỆN TẠI</p>
          <h2>{data?.package?.name || "Chưa có gói hoạt động"}</h2>
          <p className="muted">
            {data?.package?.priceVnd
              ? new Intl.NumberFormat("vi-VN").format(data.package.priceVnd) +
                " VNĐ / tháng"
              : "Giá tùy chỉnh"}{" "}
            — {statusLabel(data?.status || "")}
          </p>
        </div>
        <span className="planBadge">{data?.package?.code || "—"}</span>
      </div>
      <p className="muted note">
        Việc thay đổi gói hiện chỉ dùng để kích hoạt trong môi trường phát triển; chưa phát sinh thanh toán.
      </p>
      <MetaAdsSettings request={request} />
    </>
  );
}
export default App;
