"use client";
import { sortRows, type Sort } from "./table-sort";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Activity,
  LayoutDashboard,
  ClipboardList,
  Layers,
  History,
  Settings2,
  Database,
  ArrowUpRight,
  RefreshCw,
  Download,
  Search,
  ChevronRight,
  Check,
  Plus,
  X,
  ShieldCheck,
  AlertCircle,
  Users,
  CalendarDays,
} from "lucide-react";

type Row = Record<string, any>;
const reportDescription = (text: string) => text.replace(/BAGWIS-derived roster/gi, "initial roster").replace(/BAGWIS/gi, "initial roster");
const categories = ["Officer", "EP", "Civilian", "Unclassified"];
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );
async function api(path: string, data?: unknown) {
  const r = await fetch("/api" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const body = await r.text();
  let j: any = null;
  try {
    j = body ? JSON.parse(body) : null;
  } catch {
    throw Error(
      `Request failed (${r.status}): ${body.slice(0, 160) || "empty response"}`,
    );
  }
  if (!r.ok) {
    throw Error(
      typeof j?.detail === "string"
        ? j.detail
        : JSON.stringify(j?.detail || `Request failed (${r.status})`),
    );
  }
  return j;
}
const fmt = (n: number | undefined | null) =>
  n == null ? "—" : n.toLocaleString();
const time = (s: string) =>
  s
    ? new Date(s).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function Stat({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: any;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={"stat " + tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Chip({ value }: { value: string }) {
  return (
    <span className={"chip " + value.toLowerCase().replaceAll(" ", "-")}>
      {value}
    </span>
  );
}
function Bar({ metrics }: { metrics: Row }) {
  const total = metrics.assigned || 1;
  return (
    <div
      className="stackbar"
      aria-label={`${metrics.available} available, ${metrics.unavailable} unavailable, ${metrics.unresolved} unresolved`}
    >
      <i
        style={{
          width: (100 * metrics.available) / total + "%",
          background: "var(--green)",
        }}
      />
      <i
        style={{
          width: (100 * metrics.unavailable) / total + "%",
          background: "#91a2b7",
        }}
      />
      <i
        style={{
          width: (100 * metrics.unresolved) / total + "%",
          background: "var(--amber)",
        }}
      />
    </div>
  );
}

function TableOrder({ label, options, value, onChange }: { label: string; options: [string,string][]; value: Sort; onChange: (sort: Sort) => void }) {
  return <div className="table-order"><label>{label}<select aria-label={label} value={value.key} onChange={e => onChange({...value,key:e.target.value})}>{options.map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select></label><button aria-label={`${label}: reverse order`} onClick={() => onChange({...value,descending:!value.descending})}>{value.descending ? "Descending ↓" : "Ascending ↑"}</button></div>;
}
const personnelOrder: [string,string][] = [["rank","Rank (seniority)"],["name","Name"],["category","Category"],["status","Daily status"],["note","Note"]];
const unitOrder: [string,string][] = [["name","Unit name"],["status","State"],["metrics.assigned","Assigned"],["metrics.available","Available"],["metrics.unresolved","Unresolved"],["authorized","Authorized TO"],["fill_rate","Fill rate"],["updated_at","Latest published"]];

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rosterSort, setRosterSort] = useState<Sort>({key:"rank",descending:false});
  const [unitSort, setUnitSort] = useState<Sort>({key:"name",descending:false});
  const [historySort, setHistorySort] = useState<Sort>({key:"rank",descending:false});
  const [ruleSort, setRuleSort] = useState<Sort>({key:"label",descending:false});
  const fallbackWorkspaces = [
    { id: "AETC", name: "Headquarters roster", role: "hq" },
    ...["440AMG", "441SSS", "442OMS", "443FMS", "AFOS", "HAETDC", "NCOS", "PAFALEN", "PAFBMS", "PAFFS", "PAFLTC", "PAFOCS", "PAFTSS"].map((id) => ({ id: `AETC--${id}`, name: id, role: "unit" })),
  ];
  const [workspaces, setWorkspaces] = useState<Row[]>(fallbackWorkspaces),
    [actor, setActor] = useState<Row | null>(null),
    [view, setView] = useState("overview"),
    [day, setDay] = useState(today()),
    [root, setRoot] = useState("AETC");
  const [dash, setDash] = useState<Row | null>(null),
    [trend, setTrend] = useState<Row[]>([]),
    [provenance, setProvenance] = useState<Row | null>(null),
    [reference, setReference] = useState<Row | null>(null);
  const [report, setReport] = useState<Row | null>(null),
    [personnelRows, setPersonnelRows] = useState<Row[]>([]),
    [personFocus, setPersonFocus] = useState<Row | null>(null),
    [personHistory, setPersonHistory] = useState<Row[]>([]),
    [unit, setUnit] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [publish, setPublish] = useState(false),
    [reviewPublish, setReviewPublish] = useState(true),
    [detail, setDetail] = useState<Row | null>(null),
    [revision, setRevision] = useState<Row | null>(null),
    [adding, setAdding] = useState(false);
  const [policyHistory, setPolicyHistory] = useState<Row[]>([]),
    [mwb, setMwb] = useState("unresolved"),
    [mwbLabel, setMwbLabel] = useState("MWB · definition pending"),
    [passes, setPasses] = useState(false),
    [policyReason, setPolicyReason] = useState("");
  const [newPerson, setNewPerson] = useState({
    name: "",
    rank: "",
    category: "EP",
    reason: "",
  });
  const alert = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const currentScope = useRef("");
  currentScope.current = `${actor?.unit_id}/${root}/${day}`;
  const refresh = useCallback(async () => {
    if (!actor) return;
    const requestScope = `${actor.unit_id}/${root}/${day}`;
    const [d, t] = await Promise.all([
      api(`/dashboard?day=${day}&root=${root}`),
      api(`/trend?day=${day}&root=${root}`),
    ]);
    if (currentScope.current === requestScope) {
      setDash(d);
      setTrend(t);
    }
  }, [actor, day, root]);
  async function loadReport(id: string) {
    setError("");
    setSelected([]);
    setPage(0);
    setSearch("");
    setFilter("all");
    const r = await api(`/units/${encodeURIComponent(id)}/return?day=${day}`);
    setReport(r);
    setUnit(id);
    setReason("");
    setDirty(false);
    setView("return");
  }
  async function switchWorkspace(id: string) {
    if (dirty) {
      setError("Save or discard the current edits before switching workspace.");
      return;
    }
    setBusy(true);
    try {
      const a = await api("/session", { username: id === "AETC" ? "C1" : `DP-${id.split("--")[1] || id}`, password: "demopass" });
      setActor(a);
      setRoot(a.unit_id);
      setReport(null);
      setView("overview");
      setError("");
    } catch (e) {
      alert(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        setWorkspaces(await api("/workspaces"));
        const a = await api("/session");
        setActor(a);
        setRoot(a.unit_id);
      } catch (e) {
        // A missing session is expected on the sign-in screen.
        if (!(e instanceof Error) || !e.message.includes("Sign in to continue")) alert(e);
      }
    })();
  }, []);
  useEffect(() => {
    if (!actor) return;
    Promise.all([api("/provenance"), api("/reference")])
      .then(([p, r]) => {
        setProvenance(p);
        if (p?.manifest?.demo_day) setDay(p.manifest.demo_day);
        setReference(r);
      })
      .catch(alert);
  }, [actor]);
  useEffect(() => {
    if (!actor || view !== "personnel") return;
    api(`/personnel?root=${encodeURIComponent(root)}&day=${day}`)
      .then(setPersonnelRows)
      .catch(alert);
  }, [actor, view, root, day]);
  async function openPerson(person: Row) {
    setPersonFocus(person);
    try {
      const data = await api(`/personnel/${encodeURIComponent(person.id)}/history`);
      setPersonHistory(data.history || []);
    } catch (e) {
      alert(e);
    }
  }
  useEffect(() => {
    refresh().catch(alert);
    const timer = setInterval(() => refresh().catch(alert), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!actor) return;
    api("/policy/history")
      .then((p) => {
        setPolicyHistory(p);
        const rules = p[0].rules;
        setMwb(
          rules.mwb.available === null
            ? "unresolved"
            : String(rules.mwb.available),
        );
        setMwbLabel(rules.mwb.label);
        setPasses(rules.passes.available);
      })
      .catch(alert);
  }, [actor, view]);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  const modalOpen = Boolean(publish || detail || revision || adding);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const elements = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) || [],
      );
    elements()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPublish(false);
        setDetail(null);
        setRevision(null);
        setAdding(false);
      }
      if (e.key === "Tab") {
        const items = elements();
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [modalOpen]);
  function nav(v: string) {
    if (dirty) {
      setError("Save or discard the current edits before leaving this return.");
      return;
    }
    setView(v);
    setError("");
  }
  function updateEntry(id: string, patch: Row) {
    setReport((r) =>
      r
        ? {
            ...r,
            entries: r.entries.map((e: Row) =>
              e.id === id ? { ...e, ...patch } : e,
            ),
          }
        : r,
    );
    setDirty(true);
  }
  function bulk(status: string) {
    setReport((r) =>
      r
        ? {
            ...r,
            entries: r.entries.map((e: Row) =>
              selected.includes(e.id) ? { ...e, status } : e,
            ),
          }
        : r,
    );
    setDirty(true);
    setSelected([]);
  }
  async function save(isPublished: boolean) {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/units/${encodeURIComponent(unit)}/return`, {
        day,
        expected_revision: report.revision,
        publish: isPublished,
        reason,
        establishment: report.establishment,
        entries: report.entries.map((e: Row) => ({
          id: e.id,
          status: e.status,
          note: e.note,
          rank: e.rank,
          category: e.category,
        })),
      });
      setPublish(false);
      await loadReport(unit);
      await refresh();
      setToast(
        isPublished
          ? `Revision ${result.revision} published. Headquarters totals recomputed.`
          : `Draft revision ${result.revision} saved. Headquarters still sees the last published return.`,
      );
    } catch (e) {
      alert(e);
    } finally {
      setBusy(false);
    }
  }
  function changeDate(value: string) {
    if (dirty) {
      setError("Save or discard your edits before changing the date.");
      return;
    }
    setDay(value);
    setReport(null);
    setView("overview");
  }
  const editable = actor?.role === "unit" && actor.unit_id === unit;
  const entries: Row[] = report?.entries || [];
  const filtered = sortRows(entries.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      `${e.name} ${e.rank} ${e.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  ), rosterSort);
  const rules = report?.policy?.rules || dash?.policy?.rules || {};
  const available = entries.filter(
    (e) => e.status !== "not_assigned" && rules[e.status]?.available === true,
  ).length;
  const assigned = entries.filter((e) => e.status !== "not_assigned").length;
  const unresolved = entries.filter(
    (e) => e.status !== "not_assigned" && rules[e.status]?.available === null,
  ).length;
  const visibleUnits = sortRows((dash?.units || []).filter(
    (u: Row) =>
      `${u.id} ${u.name}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || u.status.toLowerCase() === filter),
  ), unitSort);
  async function login() {
    setBusy(true);
    setError("");
    try {
      const a = await api("/session", { username, password });
      setActor(a);
      setRoot(a.unit_id);
      setView("overview");
      setPassword("");
    } catch (e) {
      alert(e);
    } finally {
      setBusy(false);
    }
  }
  if (!actor) return <div className="login-shell"><div className="login-card"><div className="login-brand"><img src="/unit-ones-logo.png" alt="Unit Ones" className="login-logo" /></div><h1>Unit Ones</h1><p className="login-subtitle">Manage your unit’s daily return or review the consolidated personnel picture.</p>{error && <div role="alert" className="error">{error}</div>}<form className="login-form" onSubmit={(event) => { event.preventDefault(); login(); }}><label>Username<input autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="C1 or DP-440AMG" autoComplete="username" /></label><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /></label><button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form><small className="login-help">Use your assigned Unit Ones account.</small></div></div>;
  const navItems = [
    ["overview", "Daily picture", LayoutDashboard],
    ["personnel", "Personnel", Users],
    ["units", "Unit returns", ClipboardList],
    ["strength", "Strength & establishment", Layers],
    ["history", "Revision history", History],
    ["policy", "Calculation rules", Settings2],
    ["source", "Sources & scope", Database],
  ] as const;

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside>
        <div className="brand">
          <div
            className="brandmark"
            role="button"
            tabIndex={0}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSidebarCollapsed((collapsed) => !collapsed);
              }
            }}
          ><img src="/unit-ones-logo.png" alt="Unit Ones" />
            <svg className="legacy-mark" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M13 29c0-9 6-16 15-16 5 0 9 2 12 6l5-2-2 7c1 2 2 4 2 6 0 8-7 13-16 13S13 38 13 29Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
              <path d="M17 18c-1-5 2-9 6-11 0 4 3 5 5 6M39 25l6 2-6 4M21 29h.1M32 29h.1M22 37c3 2 7 2 10 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="brand-name">UNIT ONES</div>
        </div>
        <div className="workspace-label">AETC REPORTING WORKSPACE</div>
        <label className="workspace">
          <ShieldCheck size={18} />
          <select
            aria-label="Reporting workspace"
            value={actor?.unit_id || ""}
            onChange={(e) => switchWorkspace(e.target.value)}
            disabled={busy}
          >
            <optgroup label="Headquarters">
              {workspaces
                .filter((w) => w.role === "hq" && w.id === "AETC")
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Unit reporting">
              {workspaces
                .filter((w) => w.role === "unit")
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id.split("--")[0]} / {w.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <nav>
          {navItems.map(([id, label, Icon]) => (
            <button
              className={view === id ? "active" : ""}
              key={id}
              onClick={() => {
                setSearch("");
                setFilter("all");
                nav(id);
              }}
            >
              <Icon size={18} />
              {label}
              {id === "units" && dash && (
                <b>{dash.coverage.expected - dash.coverage.reported}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> Connected{" "}
          <p>
            Unit-owned reporting.
            <br />
            One consolidated picture.
          </p>
          <small>From the source to the daily picture</small>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Personnel operations <ChevronRight size={14} />
            <strong>{actor?.name || "Connecting…"}</strong>
          </div>
          <div className="header-tools">
            <span className="chip local">SECURE SESSION</span>
            <label className="date">
              <CalendarDays size={16} />
              <input
                aria-label="Reporting date"
                type="date"
                value={day}
                max={today()}
                onChange={(e) => changeDate(e.target.value)}
              />
            </label>
            <span className="avatar">{actor?.role === "hq" ? "C1" : "DP"}</span>
            <button className="logout" onClick={async () => { await api("/session/logout", {}); setActor(null); setDash(null); setReport(null); }}>Log out</button>
          </div>
        </header>
        <main>
          <div className="demo-strip">
            <span className="live-dot" />
            <strong>From the source to the daily picture</strong>
            <span>Each unit updates · C1 reviews all subunits · Recompute the daily picture</span>
          </div>
          {error && (
            <div role="alert" className="error">
              <AlertCircle size={18} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div role="status" className="toast">
              <Check size={18} />
              {toast}
            </div>
          )}
          {!dash ? (
            <div className="empty">Loading the reporting picture…</div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">DAILY PERSONNEL PICTURE</div>
                      <h1>
                        Readiness for day
                        <span className="title-dot">.</span>
                      </h1>
                      <p>
                        {root} · Published unit returns for{" "}
                        {new Date(day + "T12:00:00").toLocaleDateString(
                          "en-PH",
                          { month: "long", day: "numeric", year: "numeric" },
                        )}
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        onClick={() =>
                          refresh()
                            .then(() =>
                              setToast(
                                "Recomputed from the latest published revisions.",
                              ),
                            )
                            .catch(alert)
                        }
                      >
                        <RefreshCw size={16} />
                        Recompute
                      </button>
                      {actor?.role === "unit" ? (
                        <button
                          className="primary"
                          onClick={() => loadReport(actor.unit_id).catch(alert)}
                        >
                          Update today’s return
                          <ArrowUpRight size={16} />
                        </button>
                      ) : (
                        <a
                          className="button primary"
                          href={`/api/export?day=${day}&root=${root}`}
                          download={`readiness-${root}-${day}.json`}
                        >
                          <Download size={16} />
                          Export snapshot
                        </a>
                      )}
                    </div>
                  </div>
                  <section className="panel staffing-summary">
                    <div className="panel-heading"><div><h2>Personnel fill-up</h2><p>{dash.staffing?.authority}</p></div><Chip value={dash.staffing?.rating || "TO required"} /></div>
                    <div className="stats">
                      <Stat label="Actual personnel" value={fmt(dash.staffing?.actual)} detail="Roster strength with published corrections" />
                      <Stat label="Authorized TO" value={fmt(dash.staffing?.authorized)} detail="Officer, EP and civilian positions" />
                      <Stat label="Fill-up rate" value={dash.staffing?.fill_rate == null ? "—" : `${dash.staffing.fill_rate}%`} detail="Actual personnel ÷ TO × 100" />
                      <Stat label="Personnel readiness" value={dash.staffing?.rating || "—"} detail="R1 ≥85% · R2 ≥74.5% · R3 ≥50.51% · R4 ≤50.5%" />
                    </div>
                    <p className="panel-foot">Staffing includes the roster of units awaiting a daily return. Daily conditions below use published returns for the selected date.</p>
                  </section>
                  <div className="stats daily-conditions">
                    <Stat label="MWB" value={fmt(dash.metrics.counts.mwb)} detail="Published MWB reports" tone="amber" />
                    <Stat label="Passes" value={fmt(dash.metrics.counts.passes)} detail="Published passes reports" />
                    <Stat label="Leave" value={fmt(dash.metrics.counts.leave)} detail="Published leave reports" />
                    <Stat label="Hospitalized" value={fmt(dash.metrics.counts.hospitalized)} detail="Published hospitalization reports" />
                  </div>
                  <div className="stats">
                    <Stat
                      label="Reported assigned strength"
                      value={fmt(dash.metrics.assigned)}
                      detail="Personnel in published returns"
                    />
                    <Stat
                      label="Confirmed available"
                      value={fmt(dash.metrics.available)}
                      detail="Counted under the selected policy"
                      tone="green"
                    />
                    <Stat
                      label="Reported unavailable"
                      value={fmt(dash.metrics.unavailable)}
                      detail="Passes, hospitalization & other absences"
                    />
                    <Stat
                      label="Awaiting clarification"
                      value={fmt(dash.metrics.unresolved)}
                      detail="Unconfirmed status or unresolved MWB"
                      tone="amber"
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Availability composition</h2>
                          <p>People counted once, in their owning unit.</p>
                        </div>
                        <Chip
                          value={
                            dash.complete
                              ? "All units reported"
                              : "Partial coverage"
                          }
                        />
                      </div>
                      <div className="composition">
                        <div>
                          <strong>
                            {dash.metrics.rate === null
                              ? "—"
                              : dash.metrics.rate + "%"}
                            <small>availability rate</small>
                          </strong>
                          <p>
                            {dash.metrics.unresolved
                              ? "Rate withheld while reported statuses remain unresolved."
                              : !dash.complete
                                ? "Reported population only. Missing units are excluded."
                                : "Available ÷ reported assigned strength."}
                          </p>
                        </div>
                        <div className="composition-bar">
                          <Bar metrics={dash.metrics} />
                          <div className="legend">
                            <span>
                              <i className="green-bg" />
                              Available {fmt(dash.metrics.available)}
                            </span>
                            <span>
                              <i className="gray-bg" />
                              Unavailable {fmt(dash.metrics.unavailable)}
                            </span>
                            <span>
                              <i className="amber-bg" />
                              Unresolved {fmt(dash.metrics.unresolved)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="status-tiles">
                        {["passes", "hospitalized", "mwb", "leave"].map((s) => (
                          <div key={s}>
                            <span>{rules[s]?.label || s}</span>
                            <strong>{fmt(dash.metrics.counts[s])}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="panel-foot">
                        Policy v{dash.policy.id} · Computed{" "}
                        {time(dash.computed_at)} · Refreshes every 15 seconds
                      </div>
                    </section>
                    <section className="panel coverage">
                      <div className="panel-heading">
                        <div>
                          <h2>Reporting coverage</h2>
                          <p>Missing does not mean zero.</p>
                        </div>
                        <ClipboardList size={19} />
                      </div>
                      <div className="coverage-number">
                        {dash.coverage.reported}
                        <span>/ {dash.coverage.expected}</span>
                      </div>
                      <p>units have published for this date</p>
                      <div className="progress">
                        <i
                          style={{
                            width:
                              (100 * dash.coverage.reported) /
                                (dash.coverage.expected || 1) +
                              "%",
                          }}
                        />
                      </div>
                      <div className="coverage-bottom">
                        <span>
                          {
                            dash.units.filter((u: Row) => u.status === "Draft")
                              .length
                          }{" "}
                          drafts
                        </span>
                        <span>
                          {
                            dash.units.filter(
                              (u: Row) => u.status === "Missing",
                            ).length
                          }{" "}
                          missing
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter("all");
                          setSearch("");
                          nav("units");
                        }}
                      >
                        Review unit returns <ArrowUpRight size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="overview-grid bottom-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Units requiring attention</h2>
                          <p>Follow up at the source of the report.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => nav("units")}
                        >
                          All units <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="attention-list">
                        {dash.units
                          .filter(
                            (u: Row) =>
                              u.status !== "Published" ||
                              u.newer_draft ||
                              u.pending_additions > 0 ||
                              u.metrics?.unresolved > 0,
                          )
                          .slice(0, 5)
                          .map((u: Row) => (
                            <button
                              key={u.id}
                              onClick={() => loadReport(u.id).catch(alert)}
                            >
                              <div className="unit-symbol">
                                <ClipboardList size={17} />
                              </div>
                              <div>
                                <strong>{u.name}</strong>
                                <small>
                                  {u.parent_id} ·{" "}
                                  {u.pending_additions > 0
                                    ? `${u.pending_additions} roster additions awaiting publication`
                                    : u.status === "Missing"
                                      ? "No return for this date"
                                      : u.newer_draft
                                        ? "Newer draft awaiting publication"
                                        : u.status === "Draft"
                                          ? "Draft awaiting publication"
                                          : `${u.metrics?.unresolved || 0} statuses to clarify`}
                                </small>
                              </div>
                              <Chip value={u.status} />
                              <ChevronRight size={17} />
                            </button>
                          ))}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Seven-day picture</h2>
                          <p>Available personnel in published returns</p>
                        </div>
                      </div>
                      <div className="trend">
                        {trend.map((t) => (
                          <div
                            key={t.day}
                            title={`${t.day}: ${t.metrics.available} available; ${t.coverage.reported}/${t.coverage.expected} units reported`}
                          >
                            <span>
                              {t.coverage.reported
                                ? fmt(t.metrics.available)
                                : "—"}
                            </span>
                            <div>
                              <i
                                style={{
                                  height:
                                    Math.max(
                                      t.coverage.reported ? 3 : 0,
                                      (100 * t.metrics.available) /
                                        Math.max(
                                          ...trend.map(
                                            (d) => d.metrics.available,
                                          ),
                                          1,
                                        ),
                                    ) + "%",
                                }}
                              />
                            </div>
                            <small>{t.day.slice(5)}</small>
                            <em>
                              {t.coverage.reported}/{t.coverage.expected}
                            </em>
                          </div>
                        ))}
                      </div>
                      <div className="panel-foot">
                        Coverage shown beneath each day. Bars may represent
                        different populations.
                      </div>
                    </section>
                  </div>
                </>
              )}

              {view === "personnel" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">PERSONNEL ROSTER</div>
                      <h1>Personnel</h1>
                      <p>Search every assigned person, review daily status history, and maintain transferred records.</p>
                    </div>
                    <Users size={32} />
                  </div>
                  <section className="panel">
                    <div className="table-toolbar">
                      <label className="search"><Search size={17} /><input aria-label="Search all personnel" placeholder="Search name, rank or unit…" value={search} onChange={e => setSearch(e.target.value)} /></label>
                      <select aria-label="Personnel roster scope" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Current and transferred</option><option value="active">Current personnel</option><option value="transferred">Transferred archive</option></select>
                      <span className="table-count">{personnelRows.filter(p => (filter === "all" || p.status === filter) && `${p.name} ${p.rank} ${p.unit_name}`.toLowerCase().includes(search.toLowerCase())).length} people</span>
                    </div>
                    <div className="table-scroll"><table className="roster"><thead><tr><th>Personnel</th><th>Unit</th><th>Category</th><th>Assignment</th><th>History</th><th /></tr></thead><tbody>{personnelRows.filter(p => (filter === "all" || p.status === filter) && `${p.name} ${p.rank} ${p.unit_name}`.toLowerCase().includes(search.toLowerCase())).map(p => <tr key={p.id}><td><strong>{p.rank} {p.name}</strong><small>{p.id}</small></td><td>{p.unit_name}</td><td>{p.category}</td><td><Chip value={p.status === "transferred" ? "Transferred" : "Current"} />{p.ended_on && <small>Ended {p.ended_on}</small>}</td><td><button className="icon-button" aria-label={`View history for ${p.name}`} onClick={() => openPerson(p)}><History size={17} /></button></td><td>{p.status === "active" && actor?.role === "hq" || (p.status === "active" && actor?.unit_id === p.unit_id) ? <button onClick={async () => { const reason = window.prompt("Transfer reason"); if (!reason) return; await api(`/personnel/${encodeURIComponent(p.id)}/transfer`, { day, reason }); setPersonnelRows(await api(`/personnel?root=${encodeURIComponent(root)}&day=${day}`)); }}>Transfer</button> : null}</td></tr>)}</tbody></table></div>
                  </section>
                </>
              )}
              {(view === "units" || view === "strength") && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">
                        {view === "units"
                          ? "REPORTING CONTROL"
                          : "DPP CONSOLIDATION"}
                      </div>
                      <h1>
                        {view === "units"
                          ? "Unit returns"
                          : "Strength & establishment"}
                      </h1>
                      <p>
                        {view === "units"
                          ? "Publish at the unit. Consolidate automatically at headquarters."
                          : "Assigned strength and establishment fill are distinct from daily availability."}
                      </p>
                    </div>
                    <a
                      className="button"
                      href={`/api/export?day=${day}&root=${root}`}
                      download
                    >
                      <Download size={16} />
                      Export snapshot
                    </a>
                  </div>
                  {view === "strength" && (
                    <>
                      <div className="stats">
                        {categories.map((c) => (
                          <Stat
                            key={c}
                            label={c}
                            value={fmt(dash.metrics.categories[c] || 0)}
                            detail="Assigned in published returns"
                          />
                        ))}
                      </div>
                      <div className="notice">
                        Only unit-declared establishments with a named authority
                        produce subunit fill rates. AETC uses the supplied TO S-2025 total of 1,481.
                      </div>
                    </>
                  )}
                  <section className="panel">
                    <div className="table-toolbar">
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="Search units"
                          placeholder="Find a unit…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter reporting status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">All reporting states</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="missing">Missing</option>
                      </select>
                      <span>{visibleUnits.length} units</span>
                    </div>
                    <TableOrder label="Sort units by" options={unitOrder} value={unitSort} onChange={setUnitSort} />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Reporting unit</th>
                            <th>State</th>
                            <th>Assigned</th>
                            {view === "strength" ? (
                              <>
                                <th>Officer / EP / Civ</th>
                                <th>Authorized</th>
                                <th>Fill rate</th>
                              </>
                            ) : (
                              <>
                                <th>Available</th>
                                <th>Unresolved</th>
                                <th>Composition</th>
                              </>
                            )}
                            <th>Latest published</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleUnits.map((u: Row) => (
                            <tr key={u.id}>
                              <td>
                                <strong>{u.name}</strong>
                                <small>
                                  {u.parent_id}
                                  {u.source.needs_review
                                    ? " · Assignment mapping needs review"
                                    : ""}
                                </small>
                              </td>
                              <td>
                                <Chip value={u.status} />
                                {u.newer_draft && <small>Newer draft</small>}
                                {u.pending_additions > 0 && (
                                  <small>
                                    {u.pending_additions} roster additions
                                    pending
                                  </small>
                                )}
                              </td>
                              <td>{fmt(u.metrics?.assigned)}</td>
                              {view === "strength" ? (
                                <>
                                  <td>
                                    {u.metrics
                                      ? `${u.metrics.categories.Officer || 0} / ${u.metrics.categories.EP || 0} / ${u.metrics.categories.Civilian || 0}`
                                      : "—"}
                                  </td>
                                  <td>{fmt(u.authorized)}</td>
                                  <td>
                                    {u.fill_rate == null
                                      ? "Not established"
                                      : u.fill_rate + "%"}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="green-text">
                                    {fmt(u.metrics?.available)}
                                  </td>
                                  <td>{fmt(u.metrics?.unresolved)}</td>
                                  <td>
                                    {u.metrics ? (
                                      <Bar metrics={u.metrics} />
                                    ) : (
                                      <small>
                                        Baseline roster: {u.baseline}
                                      </small>
                                    )}
                                  </td>
                                </>
                              )}
                              <td>
                                {u.revision
                                  ? `Revision ${u.revision}`
                                  : "No return"}
                                <small>
                                  {u.updated_at
                                    ? time(u.updated_at)
                                    : u.last_reported_day
                                      ? `Prior return: ${u.last_reported_day}`
                                      : "No prior publication"}
                                </small>
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Open ${u.name}`}
                                  onClick={() => loadReport(u.id).catch(alert)}
                                >
                                  <ChevronRight size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!visibleUnits.length && (
                        <div className="empty">No units match this filter.</div>
                      )}
                    </div>
                  </section>
                  {view === "strength" && (
                    <div className="bottom-grid overview-grid">
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Assigned by rank</h2>
                            <p>Recomputed from the same published revisions</p>
                          </div>
                        </div>
                        <div className="rank-grid">
                          {Object.entries(dash.metrics.ranks)
                            .sort((a, b) => Number(b[1]) - Number(a[1]))
                            .map(([rank, n]) => (
                              <div key={rank}>
                                <span>{rank}</span>
                                <strong>{fmt(Number(n))}</strong>
                              </div>
                            ))}
                        </div>
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Workbook reference</h2>
                            <p>
                              Historical evidence, kept separate from this daily
                              picture
                            </p>
                          </div>
                        </div>
                        <div className="prose">
                          <p>
                            The supplied DPP workbook carries TO S-2022 and TO
                            S-2025 alongside actual officer, EP and civilian
                            counts. Its linked reporting date is not
                            self-contained.
                          </p>
                          <p>
                            AETC uses TO S-2025: 356 officers, 1,000 EP and 125 civilian personnel (1,481 total). TO S-2022 totals 1,826 and is retained as a reference.
                          </p>
                          <small>
                            Strength.xlsx · MIL & CIV HR SR with TAS · B77:I77
                          </small>
                          <p>
                            Rank fill ratios can exceed 100%; a zero authorized
                            denominator has no defined fill rate. Unit Ones does not infer
                            does not infer an R1–R4 classification from daily
                            availability.
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}

              {view === "return" && report && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">
                        {report.unit.parent_id} / UNIT RETURN
                      </div>
                      <h1>{report.unit.name}</h1>
                      <p>
                        {day} ·{" "}
                        {report.revision
                          ? `Latest revision ${report.revision}`
                          : "New daily return"}{" "}
                        ·{" "}
                        <strong>
                          {dirty
                            ? "Unsaved edits"
                            : report.pending_additions > 0
                              ? "Roster additions awaiting publication"
                              : report.published
                                ? "Published"
                                : "Draft / unreported"}
                        </strong>
                      </p>
                    </div>
                    <div className="actions">
                      {dirty && (
                        <button onClick={() => loadReport(unit).catch(alert)}>
                          Discard edits
                        </button>
                      )}
                      {editable ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (reason.trim().length >= 3) save(false);
                              else {
                                setReviewPublish(false);
                                setPublish(true);
                              }
                            }}
                          >
                            Save draft
                          </button>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => {
                              setReviewPublish(true);
                              setPublish(true);
                            }}
                          >
                            Review & publish <ArrowUpRight size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="chip">Headquarters · read only</span>
                      )}
                    </div>
                  </div>
                  {!editable && (
                    <div className="notice">
                      This is the latest unit revision, including any
                      unpublished draft. Headquarters totals use only the latest
                      published revision.
                    </div>
                  )}
                  <div className="stats">
                    <Stat
                      label="Assigned in this return"
                      value={assigned}
                      detail={`${entries.length - assigned} roster exclusions`}
                    />
                    <Stat
                      label="Available"
                      value={available}
                      detail="Live preview under current policy"
                      tone="green"
                    />
                    <Stat
                      label="Unavailable"
                      value={assigned - available - unresolved}
                      detail="Daily absence categories"
                    />
                    <Stat
                      label="Unresolved"
                      value={unresolved}
                      detail="Needs confirmation or a policy definition"
                      tone="amber"
                    />
                  </div>
                  {report.revision === 0 && (
                    <div className="notice">
                      A new day starts unconfirmed.{" "}
                      {report.prior
                        ? `Last published return: ${report.prior.day}. `
                        : ""}
                      Confirm today’s situation before publication. Prior
                      absences are not carried forward automatically.
                    </div>
                  )}
                  <section className="panel">
                    <div className="table-toolbar">
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="Search personnel"
                          placeholder="Search name, rank or category…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                          }}
                        />
                      </label>
                      <select
                        aria-label="Filter personnel status"
                        value={filter}
                        onChange={(e) => {
                          setFilter(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="all">All daily statuses</option>
                        {Object.entries(rules).map(([k, v]) => (
                          <option key={k} value={k}>
                            {(v as Row).label}
                          </option>
                        ))}
                      </select>
                      {editable && (
                        <button onClick={() => setAdding(true)}>
                          <Plus size={16} />
                          Add missing person
                        </button>
                      )}
                    </div>
                    {selected.length > 0 && editable && (
                      <div className="bulk">
                        <strong>{selected.length} selected</strong>
                        <button onClick={() => bulk("available")}>
                          Confirm available
                        </button>
                        <button onClick={() => bulk("unknown")}>
                          Mark unconfirmed
                        </button>
                        <button onClick={() => setSelected([])}>
                          Clear selection
                        </button>
                      </div>
                    )}
                    <TableOrder label="Sort personnel by" options={personnelOrder} value={rosterSort} onChange={sort => {setRosterSort(sort); setPage(0);}} />
                    <div className="table-scroll">
                      <table className="roster">
                        <thead>
                          <tr>
                            {editable && (
                              <th>
                                <input
                                  type="checkbox"
                                  aria-label="Select visible personnel"
                                  checked={
                                    filtered.slice(page * 30, page * 30 + 30)
                                      .length > 0 &&
                                    filtered
                                      .slice(page * 30, page * 30 + 30)
                                      .every((e) => selected.includes(e.id))
                                  }
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? Array.from(
                                            new Set([
                                              ...selected,
                                              ...filtered
                                                .slice(
                                                  page * 30,
                                                  page * 30 + 30,
                                                )
                                                .map((e) => e.id),
                                            ]),
                                          )
                                        : selected.filter(
                                            (id) =>
                                              !filtered
                                                .slice(
                                                  page * 30,
                                                  page * 30 + 30,
                                                )
                                                .some((e) => e.id === id),
                                          ),
                                    )
                                  }
                                />
                              </th>
                            )}
                            <th>Personnel</th>
                            <th>Category</th>
                            <th>Daily status</th>
                            <th>Report note / correction evidence</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered
                            .slice(page * 30, page * 30 + 30)
                            .map((e) => (
                              <tr key={e.id}>
                                {editable && (
                                  <td>
                                    <input
                                      type="checkbox"
                                      aria-label={`Select ${e.name}`}
                                      checked={selected.includes(e.id)}
                                      onChange={(v) =>
                                        setSelected(
                                          v.target.checked
                                            ? [...selected, e.id]
                                            : selected.filter(
                                                (id) => id !== e.id,
                                              ),
                                        )
                                      }
                                    />
                                  </td>
                                )}
                                <td>
                                  <strong>
                                    {e.rank} {e.name}
                                  </strong>
                                  <small>
                                    {e.source.system !== "unit-reported"
                                      ? "Initial roster"
                                      : "Unit-reported addition"}
                                    {e.source.assignment_review
                                      ? " · Review assignment"
                                      : ""}
                                  </small>
                                </td>
                                <td>{e.category}</td>
                                <td>
                                  <select
                                    aria-label={`Status for ${e.name}`}
                                    disabled={!editable}
                                    value={e.status}
                                    onChange={(v) =>
                                      updateEntry(e.id, {
                                        status: v.target.value,
                                      })
                                    }
                                  >
                                    {Object.entries(rules).map(([k, v]) => (
                                      <option key={k} value={k}>
                                        {(v as Row).label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    className="note-input"
                                    aria-label={`Note for ${e.name}`}
                                    disabled={!editable}
                                    value={e.note}
                                    placeholder="Authority or short operational note"
                                    onChange={(v) =>
                                      updateEntry(e.id, {
                                        note: v.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <button
                                    aria-label={`Details for ${e.name}`}
                                    className="icon-button"
                                    onClick={() => setDetail({ ...e })}
                                  >
                                    <ChevronRight size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!filtered.length && (
                        <div className="empty">
                          No personnel match this filter.
                        </div>
                      )}
                    </div>
                    <div className="pagination">
                      <span>
                        {filtered.length
                          ? `${page * 30 + 1}–${Math.min(page * 30 + 30, filtered.length)}`
                          : "0"}{" "}
                        of {filtered.length} personnel
                      </span>
                      <button
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </button>
                      <button
                        disabled={(page + 1) * 30 >= filtered.length}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </section>
                  <div className="overview-grid bottom-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Submission context</h2>
                          <p>Keep the reporting decision traceable.</p>
                        </div>
                      </div>
                      <div className="form-area">
                        <label>
                          Reason for this revision
                          <textarea
                            aria-label="Revision reason"
                            disabled={!editable}
                            value={reason}
                            onChange={(e) => {
                              setReason(e.target.value);
                              setDirty(true);
                            }}
                            placeholder="e.g. Morning accountability completed; two passes confirmed."
                          />
                        </label>
                        <small>
                          A meaningful reason is required for drafts and
                          publications. Publication may include unresolved
                          statuses; headquarters will see the uncertainty.
                        </small>
                      </div>
                    </section>
                    <section className="panel">
                      <details>
                        <summary>
                          Authorized establishment{" "}
                          <span>Optional · versioned with this return</span>
                        </summary>
                        <div className="form-area">
                          <label>
                            Authority / establishment version
                            <input
                              disabled={!editable}
                              aria-label="Establishment authority"
                              value={report.establishment.authority || ""}
                              placeholder="Approved TO version and effective period"
                              onChange={(e) => {
                                setReport({
                                  ...report,
                                  establishment: {
                                    counts: Object.fromEntries(
                                      categories.map((c) => [c, 0]),
                                    ),
                                    ...report.establishment,
                                    authority: e.target.value,
                                  },
                                });
                                setDirty(true);
                              }}
                            />
                          </label>
                          <div className="form-grid">
                            {categories.map((c) => (
                              <label key={c}>
                                {c}
                                <input
                                  type="number"
                                  min="0"
                                  aria-label={`Authorized ${c}`}
                                  disabled={!editable}
                                  value={report.establishment.counts?.[c] ?? ""}
                                  onChange={(e) => {
                                    setReport({
                                      ...report,
                                      establishment: {
                                        ...report.establishment,
                                        counts: {
                                          ...Object.fromEntries(
                                            categories.map((k) => [k, 0]),
                                          ),
                                          ...report.establishment.counts,
                                          [c]: Number(e.target.value),
                                        },
                                      },
                                    });
                                    setDirty(true);
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                          {editable && (
                            <button
                              onClick={() => {
                                setReport({ ...report, establishment: {} });
                                setDirty(true);
                              }}
                            >
                              Clear establishment
                            </button>
                          )}
                        </div>
                      </details>
                      <div className="panel-heading">
                        <div>
                          <h2>Revision trail</h2>
                          <p>Saved versions cannot be overwritten.</p>
                        </div>
                      </div>
                      <div className="revision-list">
                        {report.history.map((h: Row) => (
                          <button
                            key={h.id}
                            onClick={() =>
                              api(`/history/${h.id}`)
                                .then(setRevision)
                                .catch(alert)
                            }
                          >
                            <History size={16} />
                            <div>
                              <strong>
                                Revision {h.revision} ·{" "}
                                {h.published ? "Published" : "Draft"}
                              </strong>
                              <small>{reportDescription(h.reason)}</small>
                            </div>
                            <span>{time(h.created_at)}</span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                        {!report.history.length && (
                          <p className="muted">
                            No saved revisions for this date.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}

              {view === "history" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">ACCOUNTABILITY</div>
                      <h1>Revision history</h1>
                      <p>
                        Open a unit’s return to inspect every draft and
                        published revision for {day}.
                      </p>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="revision-list">
                      {dash.units.map((u: Row) => (
                        <button
                          key={u.id}
                          onClick={() => loadReport(u.id).catch(alert)}
                        >
                          <History size={20} />
                          <div>
                            <strong>
                              {u.parent_id} / {u.name}
                            </strong>
                            <small>
                              {u.revision
                                ? `Published revision ${u.revision}${u.newer_draft ? " · newer draft exists" : ""}`
                                : "No published return for this date"}
                            </small>
                          </div>
                          <Chip value={u.status} />
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {view === "policy" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">EXPLICIT BUSINESS RULES</div>
                      <h1>Calculation rules</h1>
                      <p>
                        Every policy change creates a new version. Each return
                        keeps its submission policy.
                      </p>
                    </div>
                    <Chip value={`Version ${dash.policy.id}`} />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>How the daily picture is computed</h2>
                        </div>
                      </div>
                      <div className="prose">
                        <p>
                          <strong>Assigned</strong> = all personnel in a
                          published return, excluding documented “not assigned”
                          corrections.
                        </p>
                        <p>
                          <strong>Available</strong> = statuses marked available
                          by the selected policy. Unconfirmed and undefined
                          statuses remain unresolved.
                        </p>
                        <p>
                          <strong>Availability rate</strong> = available ÷
                          assigned. Withheld if any reported status is
                          unresolved. Missing units are excluded and coverage is
                          always shown.
                        </p>
                        <p>
                          <strong>Fill rate</strong> = assigned ÷ unit-declared
                          authorized strength. No rate for a missing or zero
                          denominator.
                        </p>
                        <p>
                          Headquarters recomputes the latest published revision
                          per unit and day using the current policy. Historical
                          revisions retain their original policy and raw entries
                          for audit.
                        </p>
                      </div>
                      <TableOrder label="Sort rules by" options={[["label","Status"],["effect","Availability effect"]]} value={ruleSort} onChange={setRuleSort} />
                      <table>
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>Availability effect</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortRows<Row>(Object.entries(dash.policy.rules).map(([k,v]) => ({...(v as Row),id:k,effect:(v as Row).available === null ? "Unresolved" : (v as Row).available ? "Available" : "Unavailable / excluded"})),ruleSort).map(v => (
                            <tr key={v.id}>
                              <td>{(v as Row).label}</td>
                              <td>
                                {(v as Row).available === null
                                  ? "Unresolved"
                                  : (v as Row).available
                                    ? "Available"
                                    : "Unavailable / excluded"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Policy decisions</h2>
                          <p>MWB’s meaning was not provided in the evidence.</p>
                        </div>
                      </div>
                      <div className="form-area">
                        <label>
                          MWB display definition
                          <input
                            value={mwbLabel}
                            onChange={(e) => setMwbLabel(e.target.value)}
                            disabled={actor?.unit_id !== "PAF"}
                          />
                        </label>
                        <label>
                          MWB availability effect
                          <select
                            value={mwb}
                            onChange={(e) => setMwb(e.target.value)}
                            disabled={actor?.unit_id !== "PAF"}
                          >
                            <option value="unresolved">
                              Unresolved · awaiting policy
                            </option>
                            <option value="false">Unavailable</option>
                            <option value="true">Available</option>
                          </select>
                        </label>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={passes}
                            onChange={(e) => setPasses(e.target.checked)}
                            disabled={actor?.unit_id !== "PAF"}
                          />
                          Count personnel on passes as available
                        </label>
                        <label>
                          Authority / reason
                          <textarea
                            value={policyReason}
                            onChange={(e) => setPolicyReason(e.target.value)}
                            disabled={actor?.unit_id !== "PAF"}
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={busy || actor?.unit_id !== "PAF"}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const p = await api("/policy", {
                                expected_version: dash.policy.id,
                                mwb_label: mwbLabel,
                                mwb_available:
                                  mwb === "unresolved" ? null : mwb === "true",
                                passes_available: passes,
                                reason: policyReason,
                              });
                              setPolicyHistory([p, ...policyHistory]);
                              await refresh();
                              setToast(
                                `Policy v${p.id} applied. Current-policy summaries recomputed.`,
                              );
                              setPolicyReason("");
                            } catch (e) {
                              alert(e);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Save policy version
                        </button>
                        {actor?.unit_id !== "PAF" && (
                          <small>
                            Shared rules are managed in the DPP OA-1
                            workspace.
                          </small>
                        )}
                      </div>
                      <div className="revision-list">
                        {policyHistory.map((p) => (
                          <div className="policy-version" key={p.id}>
                            <strong>Version {p.id}</strong>
                            <p>{reportDescription(p.reason)}</p>
                            <small>
                              {p.actor} · {time(p.created_at)}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}

              {view === "source" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">EVIDENCE & BOUNDARIES</div>
                      <h1>Know what the numbers represent</h1>
                      <p>
                        A source baseline, maintained by units, with explicit
                        reporting coverage.
                      </p>
                    </div>
                    <Database size={32} />
                  </div>
                  <div className="stats">
                    <Stat
                      label="Initial roster"
                      value={fmt(provenance?.manifest.personnel_count)}
                      detail="Current-roster members at import"
                    />
                    <Stat
                      label="Reporting workspaces"
                      value={provenance?.manifest.reporting_units}
                      detail="Candidate unit ownership mapping"
                    />
                    <Stat
                      label="Roster storage"
                      value="Local"
                      detail="Independent reporting database"
                    />
                    <Stat
                      label="Operational status"
                      value="Active"
                      detail="Daily returns require unit confirmation"
                      tone="amber"
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>From the source to the daily picture</h2>
                      </div>
                      <div className="prose">
                        <ol>
                          <li>
                            <strong>
                              The initial roster establishes assigned strength.
                            </strong>{" "}
                            Effective current-roster membership, rank and
                            mother/sub-unit assignment are imported once. Source
                            refresh dates range from{" "}
                            {provenance?.manifest.source_fetched_min.slice(
                              0,
                              10,
                            )}{" "}
                            to{" "}
                            {provenance?.manifest.source_fetched_max.slice(
                              0,
                              10,
                            )}
                            .
                          </li>
                          <li>
                            <strong>
                              Units establish the operational state.
                            </strong>{" "}
                            Confirm daily statuses, add missing personnel,
                            document roster exclusions, and correct ranks or
                            categories in dated returns.
                          </li>
                          <li>
                            <strong>Publication updates headquarters.</strong>{" "}
                            Drafts remain outside consolidation. A published
                            correction replaces the prior revision in the day’s
                            totals while preserving history.
                          </li>
                          <li>
                            <strong>Structured data can flow upward.</strong>{" "}
                            JSON exports carry schema version, report date,
                            coverage, source revision IDs, policy and
                            computation time.
                          </li>
                        </ol>
                        <p>
                          Imported {time(provenance?.manifest.imported_at)}.
                          The seeded roster is maintained locally; record identifiers remain
                          local. The importer does not overwrite subsequent unit
                          reporting.
                        </p>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Scope that needs confirmation</h2>
                      </div>
                      <div className="prose">
                        <p>
                          The reporting tree is derived from initial roster
                          mother-unit and sub-unit assignments. It is a
                          candidate ownership model, not a certified command
                          hierarchy.
                        </p>

                        <p>
                          Unknown sub-unit labels are routed to “Assignment
                          review.” No command or PAF-wide completeness is
                          inferred from this pilot coverage.
                        </p>
                        <p>
                          The workbooks support rank/category strength
                          reporting. They do not establish a daily availability
                          formula, MWB definition, or a complete policy for
                          attachments and hospitalization.
                        </p>
                        <small>
                          Workbook evidence:{" "}
                          Strength.xlsx · MIL & CIV HR SR with TAS · row 77
                        </small>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            <span>UNIT ONES · PERSONNEL READINESS</span>
            <span>
              Reporting date in Asia/Manila · Human staff certify the
              operational picture
            </span>
          </footer>
        </main>
      </div>

      {publish && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
          >
            <button
              className="close"
              aria-label="Close publication review"
              onClick={() => setPublish(false)}
            >
              <X />
            </button>
            <div className="eyebrow">PUBLICATION REVIEW</div>
            <h2 id="publish-title">
              {reviewPublish ? "Publish" : "Save draft for"} {report?.unit.name}
            </h2>
            <p>
              {day} · New revision {(report?.revision || 0) + 1}
            </p>
            <div className="review-summary">
              <span>
                <strong>{assigned}</strong>assigned
              </span>
              <span>
                <strong>{available}</strong>available
              </span>
              <span>
                <strong>{unresolved}</strong>unresolved
              </span>
            </div>
            <p>
              {reviewPublish
                ? "Headquarters will use this revision immediately."
                : "This draft stays outside headquarters consolidation until published."}{" "}
              {unresolved > 0
                ? "The unresolved statuses will remain visible and the availability rate will be withheld."
                : ""}
            </p>
            <label>
              Reason for this revision
              <textarea
                aria-label="Publication reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => save(reviewPublish)}
            >
              {busy
                ? "Saving…"
                : reviewPublish
                  ? "Publish & recompute"
                  : "Save draft revision"}
            </button>
          </section>
        </div>
      )}
      {personFocus && (
        <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Personnel history"><button className="close" aria-label="Close personnel history" onClick={() => setPersonFocus(null)}><X /></button><div className="eyebrow">PERSONNEL HISTORY</div><h2>{personFocus.name}</h2><p>{personFocus.rank} · {personFocus.unit_name} · {personFocus.category}</p>{personFocus.ended_on && <div className="notice">Transferred on {personFocus.ended_on}. {personFocus.end_reason}</div>}<div className="table-scroll history-table"><table><thead><tr><th>Date</th><th>Status</th><th>Publication</th><th>Note</th></tr></thead><tbody>{personHistory.map(h => <tr key={`${h.day}-${h.revision}`}><td>{h.day}</td><td><Chip value={h.status} /></td><td>{h.published ? "Published" : "Draft"}</td><td>{h.note || "—"}</td></tr>)}</tbody></table>{!personHistory.length && <div className="empty">No daily records for this person.</div>}</div></section></div>
      )}
      {detail && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Personnel details"
          >
            <button
              className="close"
              aria-label="Close personnel details"
              onClick={() => setDetail(null)}
            >
              <X />
            </button>
            <div className="eyebrow">PERSONNEL & PROVENANCE</div>
            <h2>{detail.name}</h2>
            <div className="form-grid">
              <label>
                Reported rank
                <input
                  value={detail.rank}
                  disabled={!editable}
                  onChange={(e) =>
                    setDetail({ ...detail, rank: e.target.value })
                  }
                />
              </label>
              <label>
                Reported category
                <select
                  value={detail.category}
                  disabled={!editable}
                  onChange={(e) =>
                    setDetail({ ...detail, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="prose">
              <p>
                Record: {detail.source.system === "unit-reported" ? "Unit-reported addition" : "Initial roster"}
              </p>
              <p>Owning unit: {report?.unit.name}</p>
              <p>
                Corrections apply to this dated return and are preserved in each
                revision. The initial roster is preserved.
              </p>
            </div>
            {editable && (
              <button
                className="primary"
                onClick={() => {
                  updateEntry(detail.id, {
                    rank: detail.rank,
                    category: detail.category,
                  });
                  setDetail(null);
                }}
              >
                Apply to this return
              </button>
            )}
          </section>
        </div>
      )}
      {adding && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add missing person"
          >
            <button
              className="close"
              aria-label="Close add person"
              onClick={() => setAdding(false)}
            >
              <X />
            </button>
            <h2>Add missing person</h2>
            <p>
              Creates a unit-owned roster addition from {day}. It starts
              unconfirmed and will reach headquarters only when a return is
              published.
            </p>
            <div className="form-area">
              {(["name", "rank", "reason"] as const).map((k) => (
                <label key={k}>
                  {k === "name"
                    ? "Display name / local identity"
                    : k === "rank"
                      ? "Rank"
                      : "Source authority / reason"}
                  <input
                    value={newPerson[k]}
                    onChange={(e) =>
                      setNewPerson({ ...newPerson, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Category
                <select
                  value={newPerson.category}
                  onChange={(e) =>
                    setNewPerson({ ...newPerson, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <small>
                Local additions require identity reconciliation before upstream
                integration. Save current edits first.
              </small>
              <button
                className="primary"
                disabled={busy || dirty}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/units/${encodeURIComponent(unit)}/personnel`, {
                      ...newPerson,
                      day,
                    });
                    setAdding(false);
                    setNewPerson({
                      name: "",
                      rank: "",
                      category: "EP",
                      reason: "",
                    });
                    await loadReport(unit);
                    setToast(
                      "Local roster addition saved. Confirm its status and publish the return.",
                    );
                  } catch (e) {
                    alert(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Add to unit roster
              </button>
            </div>
          </section>
        </div>
      )}
      {revision && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-label="Historical revision"
          >
            <button
              className="close"
              aria-label="Close historical revision"
              onClick={() => setRevision(null)}
            >
              <X />
            </button>
            <div className="eyebrow">IMMUTABLE HISTORY</div>
            <h2>
              Revision {revision.revision} ·{" "}
              {revision.published ? "Published" : "Draft"}
            </h2>
            <p>
              {revision.unit_id} · {revision.day} · {time(revision.created_at)}
            </p>
            <div className="notice">
              {reportDescription(revision.reason)}
              <br />
              Recorded by {revision.actor} · Submission policy v
              {revision.policy_id}
            </div>
            <p>
              {revision.entries.length} roster entries preserved.{" "}
              {
                revision.entries.filter((e: Row) => e.status !== "not_assigned")
                  .length
              }{" "}
              reported assigned. Original statuses below are preserved
              independently of current policy.
            </p>
            <TableOrder label="Sort revision by" options={personnelOrder} value={historySort} onChange={setHistorySort} />
            <div className="table-scroll history-table">
              <table>
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows<Row>(revision.entries, historySort).map((e: Row) => (
                    <tr key={e.id}>
                      <td>
                        {e.rank} {e.name}
                      </td>
                      <td>{e.status}</td>
                      <td>{e.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
