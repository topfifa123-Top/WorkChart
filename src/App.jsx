import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Trello, ListChecks, CalendarDays,
  Settings as SettingsIcon, LogOut, Plus, X, Search, ChevronLeft, ChevronRight,
  Check, XCircle, Link2, Users, Clock, AlertCircle, CheckCircle2, Circle,
  ArrowUpDown, Trash2, Pencil, Wifi, WifiOff, ShieldCheck, Loader2, Menu
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid
} from "recharts";

/* ---------------------------------------------------------------------- */
/* Constants                                                              */
/* ---------------------------------------------------------------------- */

const STORAGE_SHARED = true;
const APP_PREFIX = "gateflow";
// Baked-in default: every device connects to the team's shared Google Sheet
// automatically, unless that browser has explicitly saved its own settings.
const DEFAULT_SETTINGS = { useSheets: true, sheetsUrl: "https://script.google.com/macros/s/AKfycbxBtjL8OCh3oLxFRn_rSOcjrqFY_KHX2ET1AN5ri3Jx_4EyR-Kw0ZY_6QNEw8PUPQOS/exec" };

const STATUSES = [
  { key: "pending", label: "Pending Approval", color: "var(--c-rose)" },
  { key: "backlog", label: "Not Started", color: "var(--c-text-dim)" },
  { key: "todo", label: "To Do", color: "var(--c-info)" },
  { key: "inprogress", label: "In Progress", color: "var(--c-amber)" },
  { key: "review", label: "Review", color: "var(--c-purple)" },
  { key: "done", label: "Done", color: "var(--c-accent)" },
];

const PRIORITIES = [
  { key: "low", label: "Low", color: "var(--c-info)" },
  { key: "medium", label: "Medium", color: "var(--c-amber)" },
  { key: "high", label: "High", color: "var(--c-danger)" },
];

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "sales", label: "Sales" },
  { key: "lead", label: "Technical Leader" },
  { key: "member", label: "Member" },
];

const DEFAULT_USERS = [
  { id: "u1", username: "admin", password: "admin123", name: "Admin", role: "admin", email: "admin@example.com" },
  { id: "u2", username: "sales", password: "sales123", name: "Sales Team", role: "sales", email: "sales@example.com" },
  { id: "u3", username: "lead", password: "lead123", name: "Tech Lead", role: "lead", email: "lead@example.com" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function nextTicket(items, key, prefix) {
  let max = 0;
  items.forEach((it) => {
    const m = (it[key] || "").match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate + "T00:00:00") < today;
}

/* ---------------------------------------------------------------------- */
/* Data layer — local shared storage, or Google Sheets bridge             */
/* ---------------------------------------------------------------------- */

// This build runs inside a Claude artifact, so it uses the Claude-only
// window.storage API (shared=true) so every teammate viewing this artifact
// sees the same data.

async function loadCollection(key, settings) {
  if (settings.useSheets && settings.sheetsUrl) {
    const res = await fetch(`${settings.sheetsUrl}?action=load&key=${key}`);
    if (!res.ok) throw new Error("Sheets load failed");
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  }
  try {
    const r = await window.storage.get(`${APP_PREFIX}:${key}`, STORAGE_SHARED);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}

async function saveCollection(key, data, settings) {
  if (settings.useSheets && settings.sheetsUrl) {
    const res = await fetch(settings.sheetsUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save", key, data }),
    });
    if (!res.ok) throw new Error("Sheets save failed");
    return;
  }
  await window.storage.set(`${APP_PREFIX}:${key}`, JSON.stringify(data), STORAGE_SHARED);
}

async function loadSettings() {
  try {
    const r = await window.storage.get(`${APP_PREFIX}:settings`, STORAGE_SHARED);
    return r ? JSON.parse(r.value) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
async function saveSettings(s) {
  await window.storage.set(`${APP_PREFIX}:settings`, JSON.stringify(s), STORAGE_SHARED);
}

/* ---------------------------------------------------------------------- */
/* Small UI atoms                                                         */
/* ---------------------------------------------------------------------- */

function Badge({ color, children, mono }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        fontFamily: mono ? "var(--f-mono)" : "inherit",
      }}
    >
      {children}
    </span>
  );
}

function Ticket({ id }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{ fontFamily: "var(--f-mono)", background: "var(--c-surface-2)", color: "var(--c-text-dim)", border: "1px solid var(--c-border)" }}
    >
      {id}
    </span>
  );
}

function Button({ children, variant = "primary", onClick, type = "button", disabled, className = "", size = "md" }) {
  const base = {
    primary: { background: "var(--c-accent)", color: "#06251c", border: "1px solid var(--c-accent)" },
    ghost: { background: "transparent", color: "var(--c-text)", border: "1px solid var(--c-border)" },
    danger: { background: "transparent", color: "var(--c-danger)", border: "1px solid color-mix(in srgb, var(--c-danger) 50%, transparent)" },
    subtle: { background: "var(--c-surface-2)", color: "var(--c-text)", border: "1px solid var(--c-border)" },
  }[variant];
  const pad = size === "sm" ? "6px 10px" : "9px 14px";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-opacity hover:opacity-85 disabled:opacity-40 ${className}`}
      style={{ ...base, padding: pad, fontSize: size === "sm" ? 13 : 14 }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium mb-1" style={{ color: "var(--c-text-dim)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
  borderRadius: 8, padding: "8px 10px", color: "var(--c-text)", fontSize: 14, outline: "none",
};

function Input(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function TextArea(props) { return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 70, ...(props.style || {}) }} />; }
function Select({ children, ...props }) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>{children}</select>; }

function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.type === "error" ? "var(--c-danger)" : toast.type === "info" ? "var(--c-info)" : "var(--c-accent)";
  return (
    <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2"
      style={{ background: "var(--c-surface)", border: `1px solid ${color}`, color: "var(--c-text)" }}>
      {toast.type === "error" ? <AlertCircle size={16} color={color} /> : <CheckCircle2 size={16} color={color} />}
      <span className="text-sm">{toast.msg}</span>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(6,9,14,0.65)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-2xl overflow-hidden"
        style={{ maxWidth: wide ? 640 : 460, background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <h3 className="font-semibold" style={{ fontFamily: "var(--f-display)", fontSize: 17 }}>{title}</h3>
          <button onClick={onClose} style={{ color: "var(--c-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Login                                                                  */
/* ---------------------------------------------------------------------- */

function LoginScreen({ users, onLogin, notify }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const tryLogin = (u, p) => {
    const user = users.find((x) => x.username === u && x.password === p);
    if (user) onLogin(user);
    else notify("Invalid username or password", "error");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--c-accent)" }}>
            <ShieldCheck size={20} color="#06251c" />
          </div>
          <span style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: "var(--c-text)" }}>GateFlow</span>
        </div>
        <div className="rounded-2xl p-6" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
          <p className="text-sm mb-5" style={{ color: "var(--c-text-dim)" }}>Sign in to manage tasks and approval requests</p>
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryLogin(username, password)} placeholder="••••••••" />
          </Field>
          <Button className="w-full justify-center mt-2" onClick={() => tryLogin(username, password)}>Sign in</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sidebar + Topbar                                                       */
/* ---------------------------------------------------------------------- */

function Sidebar({ page, setPage, pendingCount, connected, mobileOpen, onClose }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "board", label: "Kanban Board", icon: Trello, badge: pendingCount },
    { key: "tasks", label: "Task List", icon: ListChecks },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ];
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(6,9,14,0.65)" }} onClick={onClose} />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col shrink-0 transition-transform duration-200 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 220, height: "100vh", background: "var(--c-surface)", borderRight: "1px solid var(--c-border)" }}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--c-accent)" }}>
            <ShieldCheck size={17} color="#06251c" />
          </div>
          <span style={{ fontFamily: "var(--f-display)", fontSize: 18, fontWeight: 700 }}>GateFlow</span>
          <button onClick={onClose} className="ml-auto md:hidden" style={{ color: "var(--c-text-dim)" }}>
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const Icon = it.icon;
            const active = page === it.key;
            return (
              <button key={it.key} onClick={() => { setPage(it.key); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={{
                  background: active ? "var(--c-surface-2)" : "transparent",
                  color: active ? "var(--c-text)" : "var(--c-text-dim)",
                  fontWeight: active ? 600 : 500,
                }}>
                <Icon size={17} />
                <span className="flex-1 text-left">{it.label}</span>
                {!!it.badge && (
                  <span className="text-xs rounded-full px-1.5 py-0.5" style={{ background: "var(--c-amber)", color: "#241703" }}>{it.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-xs flex items-center gap-1.5" style={{ color: "var(--c-text-dim)", borderTop: "1px solid var(--c-border)" }}>
          {connected ? <Wifi size={13} color="var(--c-accent)" /> : <WifiOff size={13} />}
          {connected ? "Google Sheets" : "Local storage"}
        </div>
      </aside>
    </>
  );
}

function Topbar({ title, user, onLogout, onMenuClick }) {
  return (
    <div className="flex items-center justify-between px-4 sm:px-5 md:px-8 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuClick} className="md:hidden shrink-0" style={{ color: "var(--c-text-dim)" }}>
          <Menu size={22} />
        </button>
        <h1 className="truncate" style={{ fontFamily: "var(--f-display)", fontSize: 20, fontWeight: 700 }}>{title}</h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs" style={{ color: "var(--c-text-dim)" }}>{ROLES.find((r) => r.key === user.role)?.label}</div>
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}>
          {user.name?.[0]?.toUpperCase()}
        </div>
        <button onClick={onLogout} title="Sign out" style={{ color: "var(--c-text-dim)" }}><LogOut size={18} /></button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Task Modal                                                             */
/* ---------------------------------------------------------------------- */

function SpecGroup({ label, prefix, form, set }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium mb-1" style={{ color: "var(--c-text-dim)" }}>{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="Model" value={form[prefix + "Model"] || ""} onChange={(e) => set(prefix + "Model", e.target.value)} />
        <Input placeholder="Specification" value={form[prefix + "Spec"] || ""} onChange={(e) => set(prefix + "Spec", e.target.value)} />
        <Input placeholder="Others" value={form[prefix + "Others"] || ""} onChange={(e) => set(prefix + "Others", e.target.value)} />
      </div>
    </div>
  );
}

function TaskModal({ task, users, currentUser, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(
    task || {
      title: "", description: "", project: "", status: "backlog", priority: "medium", assignee: "", dueDate: "",
      contactPerson: "", contactNumber: "", supportType: "", products: "",
      objName: "", objSize: "", objType: "", objColour: "", objMaterial: "", objReturn: "",
      mainPurpose: "", movingSpeed: "", fov: "", accuracy: "", background: "",
      cameraModel: "", cameraSpec: "", cameraOthers: "",
      lensModel: "", lensSpec: "", lensOthers: "",
      lightModel: "", lightSpec: "", lightOthers: "",
      spaceMin: "", spaceMax: "", cameraWD: "", lensWD: "", lightWD: "", lightDimension: "",
    }
  );
  const [showTech, setShowTech] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canAssign = currentUser.role === "lead" || currentUser.role === "admin";
  const needsApproval = !task?.id && currentUser.role === "sales";

  const submit = () => {
    if (!form.title.trim()) return;
    onSave(needsApproval ? { ...form, status: "pending" } : form);
  };

  return (
    <Modal title={task?.id ? `Edit task ${task.ticket || ""}` : "New task"} onClose={onClose} wide>
      <Field label="Task title"><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Set up API for client X" /></Field>
      <Field label="Description"><TextArea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project / Company"><Input value={form.project} onChange={(e) => set("project", e.target.value)} placeholder="Project / client / company name" /></Field>
        <Field label="Products"><Input value={form.products} onChange={(e) => set("products", e.target.value)} placeholder="e.g. Machine vision camera system" /></Field>
        <Field label="Contact Person"><Input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} /></Field>
        <Field label="Contact Number"><Input value={form.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} /></Field>
        <Field label="Support Type"><Input value={form.supportType} onChange={(e) => set("supportType", e.target.value)} placeholder="e.g. On-site testing" /></Field>
        {needsApproval ? (
          <Field label="Status">
            <div style={{ ...inputStyle, opacity: 0.7 }}>Pending Approval (sent to Technical Leader)</div>
          </Field>
        ) : (
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.filter((s) => s.key !== "pending").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
        {task?.id && (
          <Field label="Assignee">
            {canAssign ? (
              <Select value={form.assignee} onChange={(e) => set("assignee", e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </Select>
            ) : (
              <div style={{ ...inputStyle, opacity: 0.7, cursor: "not-allowed" }}>
                {form.assignee || "Unassigned"}
              </div>
            )}
          </Field>
        )}
      </div>

      <Button variant="ghost" size="sm" className="w-full justify-center mb-3 mt-1" onClick={() => setShowTech((s) => !s)}>
        {showTech ? "\u2212 Hide technical details" : "+ Add technical details (optional)"}
      </Button>

      {showTech && (
        <div className="rounded-lg p-3 mb-3" style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--c-text-dim)" }}>Object Characteristics</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <Input placeholder="Object name" value={form.objName} onChange={(e) => set("objName", e.target.value)} />
            <Input placeholder="Object size" value={form.objSize} onChange={(e) => set("objSize", e.target.value)} />
            <Input placeholder="Object type" value={form.objType} onChange={(e) => set("objType", e.target.value)} />
            <Input placeholder="Object colour" value={form.objColour} onChange={(e) => set("objColour", e.target.value)} />
            <Input placeholder="Object material" value={form.objMaterial} onChange={(e) => set("objMaterial", e.target.value)} />
            <Select value={form.objReturn} onChange={(e) => set("objReturn", e.target.value)}>
              <option value="">Needs to return object?</option>
              <option value="Yes">Yes, needs to return</option>
              <option value="No">No, does not need to return</option>
            </Select>
          </div>

          <div className="text-xs font-semibold mb-2" style={{ color: "var(--c-text-dim)" }}>Detection Requirement</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <Input placeholder="Main purpose" value={form.mainPurpose} onChange={(e) => set("mainPurpose", e.target.value)} />
            <Input placeholder="Moving speed (mm/s)" value={form.movingSpeed} onChange={(e) => set("movingSpeed", e.target.value)} />
            <Input placeholder="FOV" value={form.fov} onChange={(e) => set("fov", e.target.value)} />
            <Input placeholder="Accuracy (mm/pixel)" value={form.accuracy} onChange={(e) => set("accuracy", e.target.value)} />
            <Input placeholder="Background" value={form.background} onChange={(e) => set("background", e.target.value)} />
          </div>

          <div className="text-xs font-semibold mb-2" style={{ color: "var(--c-text-dim)" }}>Hardware Specifications</div>
          <SpecGroup label="Camera" prefix="camera" form={form} set={set} />
          <SpecGroup label="Lens" prefix="lens" form={form} set={set} />
          <SpecGroup label="Light source" prefix="light" form={form} set={set} />

          <div className="text-xs font-semibold mb-2 mt-1" style={{ color: "var(--c-text-dim)" }}>Space Limitation</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input placeholder="Minimum (mm)" value={form.spaceMin} onChange={(e) => set("spaceMin", e.target.value)} />
            <Input placeholder="Maximum (mm)" value={form.spaceMax} onChange={(e) => set("spaceMax", e.target.value)} />
            <Input placeholder="Camera WD" value={form.cameraWD} onChange={(e) => set("cameraWD", e.target.value)} />
            <Input placeholder="Lens WD" value={form.lensWD} onChange={(e) => set("lensWD", e.target.value)} />
            <Input placeholder="Light source WD" value={form.lightWD} onChange={(e) => set("lightWD", e.target.value)} />
            <Input placeholder="Light source dimension" value={form.lightDimension} onChange={(e) => set("lightDimension", e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div>
          {task?.id && (
            <Button variant="danger" size="sm" onClick={() => onDelete(task.id)}><Trash2 size={14} /> Delete</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>{needsApproval ? "Submit for approval" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div className="text-xl font-bold" style={{ fontFamily: "var(--f-display)" }}>{value}</div>
        <div className="text-xs" style={{ color: "var(--c-text-dim)" }}>{label}</div>
      </div>
    </div>
  );
}

function DashboardView({ tasks }) {
  const statusData = STATUSES.map((s) => ({ name: s.label, value: tasks.filter((t) => t.status === s.key).length, color: s.color }));
  const pending = tasks.filter((t) => t.status === "pending").length;
  const overdue = tasks.filter(isOverdue).length;
  const COLORS = STATUSES.map((s) => s.color);

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ListChecks} label="Total tasks" value={tasks.length} color="var(--c-info)" />
        <StatCard icon={Clock} label="Pending Approval" value={pending} color="var(--c-rose)" />
        <StatCard icon={CheckCircle2} label="Completed" value={tasks.filter((t) => t.status === "done").length} color="var(--c-accent)" />
        <StatCard icon={AlertCircle} label="Overdue" value={overdue} color="var(--c-danger)" />
      </div>

      <div className="rounded-xl p-5" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <h3 className="text-sm font-semibold mb-4">Tasks by status</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={statusData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="name" tick={{ fill: "var(--c-text-dim)", fontSize: 11 }} axisLine={{ stroke: "var(--c-border)" }} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--c-text-dim)", fontSize: 11 }} axisLine={{ stroke: "var(--c-border)" }} />
            <Tooltip contentStyle={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {statusData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Kanban Board                                                           */
/* ---------------------------------------------------------------------- */

function TaskCard({ task, onDragStart, onClick, canDecide, onApprove, onReject }) {
  const pr = PRIORITIES.find((p) => p.key === task.priority);
  const overdue = isOverdue(task);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const isPending = task.status === "pending";
  return (
    <div draggable onDragStart={(e) => onDragStart(e, task.id)}
      className="rounded-lg p-3 mb-2 hover:opacity-90"
      style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}>
      <div onClick={() => onClick(task)} className="cursor-pointer">
        <div className="flex items-center justify-between mb-1.5">
          <Ticket id={task.ticket} />
          <Badge color={pr?.color}>{pr?.label}</Badge>
        </div>
        <div className="text-sm font-medium mb-1.5">{task.title}</div>
        {task.project && <div className="text-xs mb-1.5" style={{ color: "var(--c-text-dim)" }}>{task.project}</div>}
        <div className="flex items-center justify-between text-xs" style={{ color: overdue ? "var(--c-danger)" : "var(--c-text-dim)" }}>
          <span>{task.assignee || "Unassigned"}</span>
          <span>{fmtDate(task.dueDate)}</span>
        </div>
      </div>
      {isPending && canDecide && (
        <div className="flex gap-1.5 mt-2 pt-2" style={{ borderTop: "1px solid var(--c-border)" }} onClick={(e) => e.stopPropagation()}>
          {confirmingReject ? (
            <>
              <Button size="sm" variant="danger" className="flex-1 justify-center" onClick={() => onReject(task.id)}>Confirm reject?</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingReject(false)}><X size={13} /></Button>
            </>
          ) : (
            <>
              <Button size="sm" className="flex-1 justify-center" onClick={() => onApprove(task.id)}><Check size={13} /> Approve</Button>
              <Button size="sm" variant="danger" className="flex-1 justify-center" onClick={() => setConfirmingReject(true)}><XCircle size={13} /> Reject</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BoardView({ tasks, onMove, onOpen, onNew, canDecide, onApprove, onReject }) {
  const [dragOver, setDragOver] = useState(null);
  const onDragStart = (e, id) => e.dataTransfer.setData("text/plain", id);
  const onDrop = (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    onMove(id, status);
    setDragOver(null);
  };
  return (
    <div className="p-5 md:p-8">
      <div className="flex justify-end mb-4">
        <Button onClick={onNew}><Plus size={15} /> New task</Button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((s) => {
          const items = tasks.filter((t) => t.status === s.key);
          return (
            <div key={s.key} onDragOver={(e) => { e.preventDefault(); setDragOver(s.key); }}
              onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, s.key)}
              className="rounded-xl p-3 shrink-0" style={{
                width: 270, background: "var(--c-surface)",
                border: `1px solid ${dragOver === s.key ? s.color : "var(--c-border)"}`,
                transition: "border-color .1s",
              }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs ml-auto" style={{ color: "var(--c-text-dim)" }}>{items.length}</span>
              </div>
              <div style={{ minHeight: 40 }}>
                {items.map((t) => <TaskCard key={t.id} task={t} onDragStart={onDragStart} onClick={onOpen} canDecide={canDecide} onApprove={onApprove} onReject={onReject} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Task List                                                              */
/* ---------------------------------------------------------------------- */

function TaskListView({ tasks, onOpen, onNew }) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [prF, setPrF] = useState("");
  const [sortKey, setSortKey] = useState("dueDate");
  const [sortDir, setSortDir] = useState(1);

  const filtered = useMemo(() => {
    let list = tasks.filter((t) =>
      (!search || `${t.title} ${t.project} ${t.assignee}`.toLowerCase().includes(search.toLowerCase())) &&
      (!statusF || t.status === statusF) &&
      (!prF || t.priority === prF)
    );
    list.sort((a, b) => {
      const av = a[sortKey] || "", bv = b[sortKey] || "";
      return av > bv ? sortDir : av < bv ? -sortDir : 0;
    });
    return list;
  }, [tasks, search, statusF, prF, sortKey, sortDir]);

  const toggleSort = (k) => { if (sortKey === k) setSortDir((d) => -d); else { setSortKey(k); setSortDir(1); } };
  const Th = ({ k, children }) => (
    <th onClick={() => toggleSort(k)} className="text-left px-3 py-2 text-xs font-semibold cursor-pointer select-none" style={{ color: "var(--c-text-dim)" }}>
      <span className="inline-flex items-center gap-1">{children}<ArrowUpDown size={11} /></span>
    </th>
  );

  return (
    <div className="p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" color="var(--c-text-dim)" />
          <Input style={{ paddingLeft: 30 }} placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select style={{ width: 150 }} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        <Select style={{ width: 150 }} value={prF} onChange={(e) => setPrF(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
        <Button onClick={onNew}><Plus size={15} /> New task</Button>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--c-border)" }}>
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead style={{ background: "var(--c-surface-2)" }}>
            <tr>
              <Th k="ticket">ID</Th>
              <Th k="title">Task</Th>
              <Th k="status">Status</Th>
              <Th k="priority">Priority</Th>
              <Th k="assignee">Assignee</Th>
              <Th k="dueDate">Due date</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const s = STATUSES.find((x) => x.key === t.status);
              const p = PRIORITIES.find((x) => x.key === t.priority);
              return (
                <tr key={t.id} onClick={() => onOpen(t)} className="cursor-pointer hover:opacity-80"
                  style={{ background: "var(--c-surface)", borderTop: "1px solid var(--c-border)" }}>
                  <td className="px-3 py-2.5"><Ticket id={t.ticket} /></td>
                  <td className="px-3 py-2.5 font-medium">{t.title}</td>
                  <td className="px-3 py-2.5"><Badge color={s?.color}>{s?.label}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={p?.color}>{p?.label}</Badge></td>
                  <td className="px-3 py-2.5" style={{ color: "var(--c-text-dim)" }}>{t.assignee || "—"}</td>
                  <td className="px-3 py-2.5" style={{ color: isOverdue(t) ? "var(--c-danger)" : "var(--c-text-dim)" }}>{fmtDate(t.dueDate)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--c-text-dim)" }}>No tasks found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Calendar                                                               */
/* ---------------------------------------------------------------------- */

function CalendarView({ tasks, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { if (t.dueDate) (map[t.dueDate] = map[t.dueDate] || []).push(t); });
    return map;
  }, [tasks]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold" style={{ fontFamily: "var(--f-display)", fontSize: 18 }}>{monthLabel}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={15} /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={15} /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{ background: "var(--c-border)" }}>
        {weekdays.map((w) => (
          <div key={w} className="text-center text-xs py-2 font-semibold" style={{ background: "var(--c-surface-2)", color: "var(--c-text-dim)" }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          const dateStr = d ? `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
          const dayTasks = dateStr ? tasksByDay[dateStr] || [] : [];
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const isToday = dateStr && new Date(dateStr + "T00:00:00").getTime() === today.getTime();
          return (
            <div key={i} className="p-1 sm:p-1.5 min-h-[64px] sm:min-h-[86px]" style={{ background: "var(--c-surface)", opacity: d ? 1 : 0.4 }}>
              {d && (
                <>
                  <div className="text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full"
                    style={{ background: isToday ? "var(--c-accent)" : "transparent", color: isToday ? "#06251c" : "var(--c-text-dim)", fontWeight: isToday ? 700 : 400 }}>
                    {d}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((t) => {
                      const s = STATUSES.find((x) => x.key === t.status);
                      return (
                        <div key={t.id} onClick={() => onOpen(t)} className="text-[11px] px-1.5 py-0.5 rounded truncate cursor-pointer"
                          style={{ background: `color-mix(in srgb, ${s?.color} 18%, transparent)`, color: s?.color }}>
                          {t.title}
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && <div className="text-[10px]" style={{ color: "var(--c-text-dim)" }}>+{dayTasks.length - 3} more</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Settings                                                                */
/* ---------------------------------------------------------------------- */

function SettingsView({ settings, setSettings, users, setUsers, currentUser, notify }) {
  const [url, setUrl] = useState(settings.sheetsUrl);
  const [useSheets, setUseSheets] = useState(settings.useSheets);
  const [testing, setTesting] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", name: "", email: "", role: "member" });
  const [editingId, setEditingId] = useState(null);

  const testConnection = async () => {
    if (!url.trim()) { notify("Please enter the Web App URL", "error"); return; }
    setTesting(true);
    try {
      const res = await fetch(`${url}?action=load&key=tasks`);
      if (!res.ok) throw new Error();
      await res.json();
      notify("Connected to Google Sheets successfully", "success");
    } catch {
      notify("Connection failed — check the URL and deployment again", "error");
    }
    setTesting(false);
  };

  const save = async () => {
    const s = { useSheets, sheetsUrl: url.trim() };
    await saveSettings(s);
    setSettings(s);
    notify("Settings saved", "success");
  };

  const addUser = () => {
    if (!newUser.username || !newUser.password || !newUser.name || !newUser.email) { notify("Please fill in all fields", "error"); return; }
    setUsers([...users, { id: uid(), ...newUser }]);
    setNewUser({ username: "", password: "", name: "", email: "", role: "member" });
    notify("Member added", "success");
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setNewUser({ username: u.username, password: u.password, name: u.name, email: u.email || "", role: u.role });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewUser({ username: "", password: "", name: "", email: "", role: "member" });
  };

  const saveEditedUser = () => {
    if (!newUser.username || !newUser.password || !newUser.name || !newUser.email) { notify("Please fill in all fields", "error"); return; }
    setUsers(users.map((u) => (u.id === editingId ? { ...u, ...newUser } : u)));
    cancelEdit();
    notify("Member updated", "success");
  };

  const deleteUser = (id) => {
    if (id === currentUser.id) { notify("You can't delete your own account while logged in", "error"); return; }
    const target = users.find((u) => u.id === id);
    if (target?.role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
      notify("Can't delete the last admin account", "error");
      return;
    }
    setUsers(users.filter((u) => u.id !== id));
    if (editingId === id) cancelEdit();
    notify("Member removed", "success");
  };

  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div className="rounded-xl p-5" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <h3 className="font-semibold mb-1 flex items-center gap-2"><Link2 size={16} /> Connect Google Sheets</h3>
        <p className="text-xs mb-4" style={{ color: "var(--c-text-dim)" }}>
          Uses a Google Apps Script Web App as a secure bridge to your Google Sheet (see the setup steps shared in chat). When connected, GateFlow also emails Technical Leaders on new requests, emails Sales on approval decisions, and syncs task due dates to the assignee's Google Calendar — this needs each team member's email set below.
        </p>
        <Field label="Apps Script Web App URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/xxxx/exec" />
        </Field>
        <div className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={useSheets} onChange={(e) => setUseSheets(e.target.checked)} id="useSheets" />
          <label htmlFor="useSheets" className="text-sm">Use Google Sheets as the primary database (off = use built-in local storage)</label>
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />} Test connection
          </Button>
          <Button onClick={save}>Save settings</Button>
        </div>
      </div>

      {currentUser.role === "admin" && (
        <div className="rounded-xl p-5" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Users size={16} /> Team members</h3>
          <div className="space-y-2 mb-4">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg" style={{ background: editingId === u.id ? "var(--c-surface)" : "var(--c-surface-2)", border: editingId === u.id ? "1px solid var(--c-accent)" : "1px solid transparent" }}>
                <div className="min-w-0">
                  <div>{u.name} <span style={{ color: "var(--c-text-dim)" }}>({u.username})</span></div>
                  {u.email && <div className="text-xs" style={{ color: "var(--c-text-dim)" }}>{u.email}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge color="var(--c-info)">{ROLES.find((r) => r.key === u.role)?.label}</Badge>
                  <button onClick={() => startEdit(u)} title="Edit" style={{ color: "var(--c-text-dim)" }}><Pencil size={14} /></button>
                  <button onClick={() => deleteUser(u.id)} title="Delete" style={{ color: "var(--c-danger)" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          {editingId && (
            <p className="text-xs mb-2" style={{ color: "var(--c-amber)" }}>Editing {newUser.name}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <Input placeholder="Email (for notifications)" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <Input placeholder="username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            <Input placeholder="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </div>
          <div className="flex gap-2 mt-3">
            {editingId && <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>}
            <Button size="sm" onClick={editingId ? saveEditedUser : addUser}>
              {editingId ? (<><Pencil size={14} /> Save changes</>) : (<><Plus size={14} /> Add member</>)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Root App                                                               */
/* ---------------------------------------------------------------------- */

export default function App() {
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [page, setPage] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [taskModal, setTaskModal] = useState(null); // {} new, {task} edit, null closed

  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      try {
        const [u, t] = await Promise.all([
          loadCollection("users", s), loadCollection("tasks", s),
        ]);
        setUsers(u.length ? u : DEFAULT_USERS);
        setTasks(t);
        if (!u.length) await saveCollection("users", DEFAULT_USERS, s);
      } catch (e) {
        notify("Failed to load data from Google Sheets — using local data instead", "error");
        setUsers(DEFAULT_USERS);
      }
      setReady(true);
    })();
  }, [notify]);

  const persist = async (key, data) => {
    try { await saveCollection(key, data, settings); }
    catch { notify("Failed to save data", "error"); }
  };

  const updateUsers = (list) => { setUsers(list); persist("users", list); };
  const updateTasks = (list) => { setTasks(list); persist("tasks", list); };

  const saveTask = (form) => {
    if (form.id) {
      updateTasks(tasks.map((t) => (t.id === form.id ? { ...form } : t)));
      notify("Task saved");
    } else {
      const ticket = nextTicket(tasks, "ticket", "OPT");
      updateTasks([...tasks, { ...form, id: uid(), ticket, createdBy: currentUser.name, createdAt: new Date().toISOString() }]);
      notify(form.status === "pending" ? "Request submitted for approval" : "Task saved");
    }
    setTaskModal(null);
  };
  const deleteTask = (id) => { updateTasks(tasks.filter((t) => t.id !== id)); setTaskModal(null); notify("Task deleted"); };
  const moveTask = (id, status) => updateTasks(tasks.map((t) => (t.id === id ? { ...t, status } : t)));

  const approveTask = (id) => {
    updateTasks(tasks.map((t) => (t.id === id ? { ...t, status: "backlog" } : t)));
    notify("Approved — moved to Not Started");
  };
  const rejectTask = (id) => {
    updateTasks(tasks.filter((t) => t.id !== id));
    notify("Request rejected", "info");
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const canDecide = ["lead", "admin"].includes(currentUser?.role);

  const pageTitles = {
    dashboard: "Dashboard", board: "Kanban Board", tasks: "Task List",
    calendar: "Calendar", settings: "Settings",
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--c-bg)", color: "var(--c-text-dim)" }}>
        <GlobalStyle /><Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!currentUser) {
    return <><GlobalStyle /><LoginScreen users={users} onLogin={setCurrentUser} notify={notify} /><Toast toast={toast} /></>;
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <GlobalStyle />
      <Sidebar page={page} setPage={setPage} pendingCount={pendingCount} connected={settings.useSheets && !!settings.sheetsUrl} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={pageTitles[page]} user={currentUser} onLogout={() => setCurrentUser(null)} onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          {page === "dashboard" && <DashboardView tasks={tasks} />}
          {page === "board" && (
            <BoardView tasks={tasks} onMove={moveTask} onOpen={(t) => setTaskModal({ task: t })} onNew={() => setTaskModal({})}
              canDecide={canDecide} onApprove={approveTask} onReject={rejectTask} />
          )}
          {page === "tasks" && <TaskListView tasks={tasks} onOpen={(t) => setTaskModal({ task: t })} onNew={() => setTaskModal({})} />}
          {page === "calendar" && <CalendarView tasks={tasks} onOpen={(t) => setTaskModal({ task: t })} />}
          {page === "settings" && (
            <SettingsView settings={settings} setSettings={setSettings} users={users} setUsers={updateUsers} currentUser={currentUser} notify={notify} />
          )}
        </div>
      </div>

      {taskModal !== null && (
        <TaskModal task={taskModal.task} users={users} currentUser={currentUser} onClose={() => setTaskModal(null)} onSave={saveTask} onDelete={deleteTask} />
      )}
      <Toast toast={toast} />
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
      :root {
        --c-bg: #0E1420;
        --c-surface: #161D2B;
        --c-surface-2: #1E2738;
        --c-border: #2A3447;
        --c-text: #E8ECF3;
        --c-text-dim: #8994A8;
        --c-accent: #34D3A0;
        --c-amber: #F2A93B;
        --c-danger: #F16565;
        --c-info: #5B8DEF;
        --c-purple: #A78BFA;
        --c-rose: #F472B6;
        --f-display: 'Space Grotesk', sans-serif;
        --f-mono: 'JetBrains Mono', monospace;
      }
      * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
      body { margin: 0; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 4px; }
      select { -webkit-appearance: none; appearance: none; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
    `}</style>
  );
}
