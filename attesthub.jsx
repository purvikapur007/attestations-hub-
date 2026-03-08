import { useState } from "react";
import {
  LayoutDashboard, ClipboardList, Users, Upload, Plus, X,
  LogOut, AlertCircle, ArrowLeft, Shield, FileText,
  ChevronDown, ChevronUp, Trash2, Calendar,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function uid() { return Math.random().toString(36).slice(2, 9); }

function computeAIReview(responses, checklist) {
  let completenessPoints = 0, qualityPoints = 0, screenshotPoints = 0;
  let screenshotRequired = 0;
  const itemComments = {};

  checklist.forEach(item => {
    const resp = responses.find(r => r.checklistItemId === item.id);
    const rawText = (resp && resp.textResponse) ? resp.textResponse.trim() : "";
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;
    const hasText = wordCount > 0;
    const hasGoodText = wordCount >= 40;
    const shots = (resp && resp.screenshots) ? resp.screenshots : [];
    const hasScreenshot = shots.length > 0;
    const comments = [];

    if (item.required) {
      const complete =
        (item.evidenceType === "text" && hasText) ||
        (item.evidenceType === "screenshot" && hasScreenshot) ||
        (item.evidenceType === "both" && (hasText || hasScreenshot));
      if (complete) {
        completenessPoints += 1;
      } else if (hasText && !hasGoodText) {
        completenessPoints += 0.4;
        comments.push({ type: "warn", text: "Response is too brief — auditors expect specific detail, dates, and outcomes." });
      } else {
        comments.push({ type: "error", text: "No response provided for this required item." });
      }
    }

    if (hasText) {
      if (hasGoodText) {
        qualityPoints += 1;
      } else if (wordCount >= 15) {
        qualityPoints += 0.6;
        comments.push({ type: "info", text: `Response is short (${wordCount} words). Consider adding more specific evidence.` });
      } else {
        qualityPoints += 0.2;
        comments.push({ type: "warn", text: `Response is very brief (${wordCount} words) and unlikely to satisfy an auditor.` });
      }
    } else if (!item.required) {
      comments.push({ type: "info", text: "Optional item — no response provided." });
    }

    if (item.evidenceType === "both" || item.evidenceType === "screenshot") {
      screenshotRequired++;
      if (hasScreenshot) {
        screenshotPoints += 1;
        comments.push({ type: "ok", text: `${shots.length} screenshot(s) uploaded. Ensure images clearly show the relevant evidence.` });
      } else if (item.evidenceType === "screenshot") {
        comments.push({ type: "error", text: "Screenshot is required for this item but has not been uploaded." });
      } else {
        comments.push({ type: "info", text: "Screenshot recommended to support the text response." });
      }
    }

    itemComments[item.id] = comments;
  });

  const reqCount = checklist.filter(i => i.required).length || 1;
  const completeness = Math.round((completenessPoints / reqCount) * 100);
  const quality = Math.round((qualityPoints / checklist.length) * 100);
  const screenshot = screenshotRequired > 0 ? Math.round((screenshotPoints / screenshotRequired) * 100) : 100;
  const overall = Math.round(completeness * 0.45 + quality * 0.35 + screenshot * 0.2);

  const tiers = [
    { min: 85, label: "Excellent",          color: "green", comment: "Submission is comprehensive and well-evidenced. Recommended for manual approval." },
    { min: 65, label: "Good",               color: "blue",  comment: "Largely complete with minor gaps. A few improvements would strengthen the submission." },
    { min: 45, label: "Needs Improvement",  color: "amber", comment: "Several items need additional evidence or more detailed responses. See item-level comments." },
    { min: 0,  label: "Poor",               color: "red",   comment: "Submission is significantly incomplete. Multiple required items are missing or insufficient." },
  ];
  const tier = tiers.find(t => overall >= t.min);

  return {
    completeness, quality, screenshot, overall,
    label: tier.label, color: tier.color, comment: tier.comment,
    itemComments, reviewedAt: new Date().toISOString()
  };
}

function getAttestationStatus(att, submissions) {
  const today = new Date();
  const due = new Date(att.dueDate);
  const daysLeft = Math.ceil((due - today) / 86400000);
  const activeSubs = att.assignedTeams.map(tid =>
    submissions.find(s => s.attestationId === att.id && s.teamId === tid && s.status !== "draft")
  );
  const submitted = activeSubs.filter(Boolean).length;
  const approved  = activeSubs.filter(s => s && s.status === "approved").length;
  const rejected  = activeSubs.filter(s => s && s.status === "rejected").length;
  const notSubmitted = att.assignedTeams.length - submitted;

  if (approved === att.assignedTeams.length && att.assignedTeams.length > 0)
    return { badge: "Complete",      color: "green",  daysLeft };
  if (daysLeft < 0 && notSubmitted > 0)
    return { badge: "Overdue",       color: "red",    daysLeft };
  if (daysLeft <= 14 && notSubmitted > 0)
    return { badge: "At Risk",       color: "red",    daysLeft };
  if (rejected > 0)
    return { badge: "Issues",        color: "orange", daysLeft };
  if (submitted > 0 && notSubmitted > 0)
    return { badge: "In Progress",   color: "blue",   daysLeft };
  if (submitted > 0)
    return { badge: "Under Review",  color: "blue",   daysLeft };
  return   { badge: "Not Started",  color: "gray",   daysLeft };
}

// ═══════════════════════════════════════════════════════════════
// INITIAL DATA
// ═══════════════════════════════════════════════════════════════

const INITIAL_ATTESTATIONS = [
  {
    id: "att1",
    name: "AusPayNet Annual Security Attestation",
    scheme: "AusPayNet",
    dueDate: "2026-03-15",
    description: "Annual attestation of information security controls under AusPayNet security standards. All assigned teams must provide evidence across all checklist items.",
    assignedTeams: ["u3", "u4", "u6"],
    checklist: [
      { id: "c1", title: "Network Security Controls", description: "Describe network segmentation, firewall rules, and perimeter security measures. Include the last review date and who conducted it.", evidenceType: "both", required: true },
      { id: "c2", title: "Privileged Access Management", description: "Provide evidence of privileged access reviews conducted in the last 90 days, including the user list and approval records.", evidenceType: "both", required: true },
      { id: "c3", title: "Incident Response Testing", description: "Confirm completion of incident response testing. Provide test date, scope, and outcome summary.", evidenceType: "text", required: true },
      { id: "c4", title: "Data Encryption Standards", description: "Confirm encryption protocols used for data at rest and in transit. Reference specific standards (e.g. AES-256, TLS 1.2+).", evidenceType: "both", required: true },
      { id: "c5", title: "Vulnerability Management", description: "Results from most recent vulnerability scan: date, tool used, findings summary, and remediation status.", evidenceType: "both", required: true },
    ],
  },
  {
    id: "att2",
    name: "AP+ Fraud Control Attestation",
    scheme: "AP+",
    dueDate: "2026-04-10",
    description: "Quarterly fraud control attestation required under AP+ PayTo scheme obligations.",
    assignedTeams: ["u4", "u5"],
    checklist: [
      { id: "c1", title: "Fraud Monitoring Systems", description: "Describe real-time fraud monitoring for PayTo transactions including tooling, alert thresholds, and escalation paths.", evidenceType: "both", required: true },
      { id: "c2", title: "Transaction Anomaly Thresholds", description: "Provide current anomaly detection thresholds and evidence they were reviewed within the last quarter.", evidenceType: "both", required: true },
      { id: "c3", title: "Customer Dispute Resolution", description: "Quarterly statistics on fraud disputes resolved: volume, average resolution time, and trend vs prior quarter.", evidenceType: "text", required: true },
      { id: "c4", title: "Staff Fraud Awareness Training", description: "Evidence of fraud awareness training completion rates for all relevant staff this quarter.", evidenceType: "both", required: false },
    ],
  },
  {
    id: "att3",
    name: "AusPayNet BSB Directory Compliance",
    scheme: "AusPayNet",
    dueDate: "2026-05-01",
    description: "Compliance attestation for BSB directory maintenance and accuracy obligations.",
    assignedTeams: ["u3", "u6"],
    checklist: [
      { id: "c1", title: "BSB Record Accuracy", description: "Confirm all BSB records maintained by your institution are accurate and up to date as of the attestation date.", evidenceType: "text", required: true },
      { id: "c2", title: "Update Process Documentation", description: "Provide documentation of your BSB update request process and the team/individual responsible.", evidenceType: "both", required: true },
      { id: "c3", title: "Last Audit Date & Outcome", description: "Confirm the date of your last internal BSB directory audit and summarise the outcome.", evidenceType: "text", required: true },
    ],
  },
];

const SAMPLE_RESPONSES = [
  { checklistItemId: "c1", textResponse: "Network is segmented into DMZ, internal, and payment processing zones. All external-facing services sit behind a WAF and a stateful firewall with default-deny inter-zone policy. Last firewall rule review: 15 Feb 2026 by Security Engineering — 247 rules reviewed, 12 redundant rules removed.", screenshots: [] },
  { checklistItemId: "c2", textResponse: "Privileged access review conducted 20 Feb 2026. 23 accounts reviewed: 2 deprovisioned (leavers), 1 access level reduced, all remaining re-certified by line managers.", screenshots: [] },
  { checklistItemId: "c3", textResponse: "IR tabletop exercise completed 10 Jan 2026 covering ransomware and data breach scenarios. Key finding: CISO escalation path was unclear — updated in IR runbook. Full report on SharePoint.", screenshots: [] },
  { checklistItemId: "c4", textResponse: "", screenshots: [] },
  { checklistItemId: "c5", textResponse: "Tenable.io scan completed 1 Mar 2026. 3 Critical — all remediated within 72hr. 12 Medium — 8 resolved, 4 in active remediation with CISO-accepted risk.", screenshots: [] },
];

const INITIAL_USERS = [
  { id: "u1", name: "Purvi Kapur",        role: "admin",    assignedAttestations: ["att1", "att2", "att3"] },
  { id: "u2", name: "Alex Morgan",         role: "reviewer", assignedAttestations: ["att1", "att2", "att3"] },
  { id: "u3", name: "Payments Team",       role: "crew",     assignedAttestations: ["att1", "att3"] },
  { id: "u4", name: "Risk & Compliance",   role: "crew",     assignedAttestations: ["att1", "att2"] },
  { id: "u5", name: "Technology Services", role: "crew",     assignedAttestations: ["att2"] },
  { id: "u6", name: "Operations",          role: "crew",     assignedAttestations: ["att1", "att3"] },
];

const INITIAL_SUBMISSIONS = [
  {
    id: "sub1",
    attestationId: "att1",
    teamId: "u4",
    submittedAt: "2026-03-03T10:00:00Z",
    status: "submitted",
    responses: SAMPLE_RESPONSES,
    aiReview: computeAIReview(SAMPLE_RESPONSES, INITIAL_ATTESTATIONS[0].checklist),
    manualReview: null,
  },
];

// ═══════════════════════════════════════════════════════════════
// STYLE MAPS
// ═══════════════════════════════════════════════════════════════

const schemeStyle = {
  AusPayNet: "bg-blue-50 text-blue-700 border border-blue-200",
  "AP+":     "bg-purple-50 text-purple-700 border border-purple-200",
};

const badgeStyle = {
  Complete:       "bg-green-100 text-green-700",
  "At Risk":      "bg-red-100 text-red-700",
  Overdue:        "bg-red-200 text-red-800",
  Issues:         "bg-orange-100 text-orange-700",
  "In Progress":  "bg-blue-100 text-blue-700",
  "Under Review": "bg-blue-100 text-blue-700",
  "Not Started":  "bg-gray-100 text-gray-500",
};

const subStatusStyle = {
  "not-submitted": "bg-gray-100 text-gray-500",
  draft:           "bg-gray-100 text-gray-500",
  submitted:       "bg-blue-100 text-blue-700",
  approved:        "bg-green-100 text-green-700",
  partial:         "bg-yellow-100 text-yellow-700",
  rejected:        "bg-red-100 text-red-700",
};

// FIX: always define a fallback so aiColorStyle[anything] is safe
const aiColorStyle = {
  green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", bar: "bg-green-500" },
  blue:  { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-700",  bar: "bg-blue-500"  },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "bg-amber-500" },
  red:   { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",   bar: "bg-red-500"   },
  gray:  { bg: "bg-gray-50",  border: "border-gray-200",  text: "text-gray-600",  bar: "bg-gray-400"  },
};

const avatarBg = { admin: "bg-indigo-500", reviewer: "bg-teal-500", crew: "bg-slate-400" };

// FIX: fixed class names instead of dynamic `w-${size}`
function Avatar({ name, role, sm }) {
  const sz = sm ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${avatarBg[role] || "bg-slate-400"}`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Badge({ label, style }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>{label}</span>;
}

function ScoreBar({ label, value, barClass }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{value}%</span>
      </div>
      <div className="h-1.5 bg-white bg-opacity-60 rounded-full overflow-hidden">
        <div className={`h-full ${barClass} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

function LoginScreen({ users, onLogin }) {
  const [search, setSearch] = useState("");
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="text-blue-600" size={32} />
            <h1 className="text-2xl font-bold text-gray-800">AttestHub</h1>
          </div>
          <p className="text-sm text-gray-500">Payment Scheme Attestation Platform</p>
          <div className="flex gap-2 justify-center mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${schemeStyle.AusPayNet}`}>AusPayNet</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${schemeStyle["AP+"]}`}>AP+</span>
          </div>
        </div>
        <p className="text-sm font-medium text-gray-600 mb-2">Select your account to continue</p>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => onLogin(u)}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group flex items-center gap-3"
            >
              <Avatar name={u.name} role={u.role} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{u.name}</p>
                <p className="text-xs text-gray-400 capitalize">{u.role}</p>
              </div>
              <span className="text-gray-300 group-hover:text-blue-400 text-xl leading-none">›</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">Prototype — no password required</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════

function Sidebar({ user, view, setView, onLogout }) {
  const isAdminOrReviewer = user.role !== "crew";
  const nav = [
    { id: "dashboard",           label: "Dashboard",       Icon: LayoutDashboard },
    ...(isAdminOrReviewer ? [
      { id: "admin-attestations", label: "Attestations",   Icon: ClipboardList },
      { id: "admin-users",        label: "Team Management", Icon: Users },
    ] : []),
  ];

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <Shield className="text-blue-600" size={20} />
        <span className="font-bold text-gray-800">AttestHub</span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              view === id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <Avatar name={user.name} role={user.role} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role}</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

function Dashboard({ user, attestations, submissions, users, onSubmit, onReview }) {
  const isCrew = user.role === "crew";

  const stats = !isCrew ? {
    total:      attestations.length,
    atRisk:     attestations.filter(a => getAttestationStatus(a, submissions).color === "red").length,
    inProgress: attestations.filter(a => ["In Progress","Under Review"].includes(getAttestationStatus(a, submissions).badge)).length,
    complete:   attestations.filter(a => getAttestationStatus(a, submissions).badge === "Complete").length,
  } : null;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">{isCrew ? "My Attestations" : "Attestation Dashboard"}</h1>
        <p className="text-sm text-gray-500">
          {isCrew ? "View and submit evidence for your assigned attestations." : "Overview of all active attestations across all teams."}
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total",       value: stats.total,      bg: "bg-white",    text: "text-gray-700"  },
            { label: "At Risk",     value: stats.atRisk,     bg: "bg-red-50",   text: "text-red-600"   },
            { label: "In Progress", value: stats.inProgress, bg: "bg-blue-50",  text: "text-blue-600"  },
            { label: "Complete",    value: stats.complete,   bg: "bg-green-50", text: "text-green-600" },
          ].map(({ label, value, bg, text }) => (
            <div key={label} className={`${bg} rounded-xl p-4 border border-gray-100 shadow-sm`}>
              <p className={`text-2xl font-bold ${text}`}>{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {attestations.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <ClipboardList size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No attestations assigned to you yet.</p>
          </div>
        )}
        {attestations.map(att => (
          <AttestationCard
            key={att.id}
            att={att}
            submissions={submissions}
            users={users}
            user={user}
            isCrew={isCrew}
            onSubmit={onSubmit}
            onReview={onReview}
          />
        ))}
      </div>
    </div>
  );
}

function AttestationCard({ att, submissions, users, user, isCrew, onSubmit, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const status = getAttestationStatus(att, submissions);
  const dueStr = new Date(att.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const mySub = isCrew ? submissions.find(s => s.attestationId === att.id && s.teamId === user.id) : null;
  const myStatusKey = mySub && mySub.status !== "draft" ? mySub.status : "not-submitted";
  const myStatusLabel = myStatusKey === "not-submitted" ? "Not Submitted" : myStatusKey.charAt(0).toUpperCase() + myStatusKey.slice(1);

  const completedItems = mySub && mySub.responses
    ? mySub.responses.filter(r => (r.textResponse && r.textResponse.trim()) || (r.screenshots && r.screenshots.length)).length
    : 0;

  const isAtRisk = status.color === "red";

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isAtRisk ? "border-red-200" : "border-gray-100"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge label={att.scheme} style={schemeStyle[att.scheme] || "bg-gray-100 text-gray-600"} />
              <Badge label={status.badge} style={badgeStyle[status.badge] || "bg-gray-100 text-gray-500"} />
            </div>
            <h3 className="font-semibold text-gray-800">{att.name}</h3>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 flex-wrap">
              <Calendar size={11} />
              <span>Due {dueStr}</span>
              {status.daysLeft >= 0
                ? <span className={status.daysLeft <= 14 ? "text-red-500 font-medium" : ""}> · {status.daysLeft}d left</span>
                : <span className="text-red-500 font-medium"> · Overdue</span>}
              {!isCrew && <span className="ml-1"> · {att.assignedTeams.length} team{att.assignedTeams.length !== 1 ? "s" : ""}</span>}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isCrew && att.assignedTeams.includes(user.id) && (
              <div className="text-right mr-1">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${subStatusStyle[myStatusKey] || "bg-gray-100 text-gray-500"}`}>{myStatusLabel}</span>
                {mySub && mySub.aiReview && myStatusKey === "submitted" && (
                  <p className="text-xs text-gray-400 mt-0.5">AI: {mySub.aiReview.label}</p>
                )}
              </div>
            )}
            {isCrew && att.assignedTeams.includes(user.id) && (
              <button
                onClick={() => onSubmit(att)}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  myStatusKey === "not-submitted" || myStatusKey === "rejected"
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {myStatusKey === "not-submitted" ? "Submit" : myStatusKey === "rejected" ? "Resubmit" : "View / Edit"}
              </button>
            )}
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Team chips — admin/reviewer only */}
        {!isCrew && (
          <div className="flex gap-2 flex-wrap mt-3">
            {att.assignedTeams.map(tid => {
              const team = users.find(u => u.id === tid);
              const sub = submissions.find(s => s.attestationId === att.id && s.teamId === tid && s.status !== "draft");
              const ts = sub ? sub.status : "not-submitted";
              const icons = { approved: "✓", rejected: "✗", partial: "◑", submitted: "⏳", "not-submitted": "–" };
              return (
                <div
                  key={tid}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                    ts === "approved"  ? "bg-green-50 border-green-200" :
                    ts === "rejected"  ? "bg-red-50 border-red-200" :
                    ts === "submitted" || ts === "partial" ? "bg-blue-50 border-blue-200" :
                    "bg-gray-50 border-gray-200"
                  }`}
                >
                  <span className="font-medium text-gray-700">{team ? team.name : tid}</span>
                  <span className={
                    ts === "approved" ? "text-green-600" :
                    ts === "rejected" ? "text-red-600" :
                    ts === "submitted" ? "text-blue-600" : "text-gray-400"
                  }>{icons[ts] || "–"}</span>
                  {ts === "submitted" && (
                    <button onClick={() => onReview(att, tid)} className="text-blue-600 hover:text-blue-800 underline ml-0.5">Review</button>
                  )}
                  {(ts === "partial" || ts === "approved" || ts === "rejected") && sub && (
                    <button onClick={() => onReview(att, tid)} className="text-gray-500 hover:text-gray-700 underline ml-0.5">View</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-50 px-5 py-4 bg-gray-50">
          <p className="text-sm text-gray-600 mb-3">{att.description}</p>
          <p className="text-xs font-semibold text-gray-400 mb-2">CHECKLIST — {att.checklist.length} ITEMS</p>
          <div className="space-y-1.5">
            {att.checklist.map((item, i) => {
              const resp = mySub && mySub.responses ? mySub.responses.find(r => r.checklistItemId === item.id) : null;
              const done = resp && ((resp.textResponse && resp.textResponse.trim()) || (resp.screenshots && resp.screenshots.length));
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs ${isCrew && done ? "bg-green-500" : "bg-gray-200"}`}>
                    {isCrew && done ? "✓" : <span className="text-gray-400">{i + 1}</span>}
                  </span>
                  <span className="font-medium text-gray-700">{item.title}</span>
                  {item.required && <span className="text-red-400">*</span>}
                  <span className="text-gray-400 capitalize">({item.evidenceType})</span>
                </div>
              );
            })}
          </div>
          {isCrew && mySub && myStatusKey !== "not-submitted" && (
            <p className="text-xs text-gray-400 mt-2">{completedItems}/{att.checklist.length} items answered</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUBMIT EVIDENCE
// ═══════════════════════════════════════════════════════════════

function SubmitView({ att, existingSub, onSubmit, onBack }) {
  const initResponses = existingSub && existingSub.responses
    ? existingSub.responses
    : att.checklist.map(item => ({ checklistItemId: item.id, textResponse: "", screenshots: [] }));

  const [responses, setResponses] = useState(initResponses);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const item = att.checklist[activeIdx];
  const resp = item ? (responses.find(r => r.checklistItemId === item.id) || { textResponse: "", screenshots: [] }) : null;

  function updateText(val) {
    setResponses(prev => prev.map(r => r.checklistItemId === item.id ? { ...r, textResponse: val } : r));
  }

  function handleFiles(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setResponses(prev => prev.map(r =>
          r.checklistItemId === item.id
            ? { ...r, screenshots: [...r.screenshots, { name: file.name, data: ev.target.result }] }
            : r
        ));
      };
      reader.readAsDataURL(file);
    });
  }

  function removeShot(idx) {
    setResponses(prev => prev.map(r =>
      r.checklistItemId === item.id ? { ...r, screenshots: r.screenshots.filter((_, i) => i !== idx) } : r
    ));
  }

  function handleSubmit() {
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setDone(true); setTimeout(() => onSubmit(responses), 1200); }, 500);
  }

  const answered = responses.filter(r => (r.textResponse && r.textResponse.trim()) || (r.screenshots && r.screenshots.length)).length;
  const progress = Math.round((answered / att.checklist.length) * 100);
  const dueStr = new Date(att.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const wordCount = resp && resp.textResponse ? resp.textResponse.trim().split(/\s+/).filter(Boolean).length : 0;

  if (done) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Submitted!</h2>
        <p className="text-sm text-gray-500">Your evidence has been submitted for AI and manual review.</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back to dashboard
      </button>
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <Badge label={att.scheme} style={schemeStyle[att.scheme] || "bg-gray-100 text-gray-600"} />
          <h2 className="text-lg font-bold text-gray-800 mt-1">{att.name}</h2>
          <p className="text-sm text-gray-500">Due {dueStr} · {att.checklist.filter(c => c.required).length} required items</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-500">{answered}/{att.checklist.length} answered</p>
          <div className="w-32 h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Checklist nav */}
        <div className="w-48 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-0.5">
            <p className="text-xs font-semibold text-gray-400 px-2 mb-2">CHECKLIST</p>
            {att.checklist.map((ci, i) => {
              const r = responses.find(r => r.checklistItemId === ci.id);
              const isDone = r && ((r.textResponse && r.textResponse.trim()) || (r.screenshots && r.screenshots.length));
              return (
                <button
                  key={ci.id}
                  onClick={() => setActiveIdx(i)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                    activeIdx === i ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs ${
                    isDone ? "bg-green-500" : activeIdx === i ? "bg-blue-400" : "bg-gray-200"
                  }`}>{isDone ? "✓" : <span className={activeIdx === i ? "text-white" : "text-gray-400"}>{i + 1}</span>}</span>
                  <span className="truncate flex-1">{ci.title}</span>
                  {ci.required && <span className="text-red-400 flex-shrink-0">*</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 p-5">
          {item && resp && (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-gray-800">{item.title}</h3>
                  {item.required && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Required</span>}
                </div>
                <p className="text-sm text-gray-500 mb-2">{item.description}</p>
                <div className="flex gap-3 text-xs text-gray-400">
                  {(item.evidenceType === "text" || item.evidenceType === "both") && (
                    <span className="flex items-center gap-1"><FileText size={11} /> Text response</span>
                  )}
                  {(item.evidenceType === "screenshot" || item.evidenceType === "both") && (
                    <span className="flex items-center gap-1">📎 Screenshot evidence</span>
                  )}
                </div>
              </div>

              {(item.evidenceType === "text" || item.evidenceType === "both") && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Text Response</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 h-36"
                    placeholder="Be specific — include dates, tool names, metrics, and outcomes. Responses under 40 words will be flagged by the AI reviewer."
                    value={resp.textResponse}
                    onChange={e => updateText(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">{wordCount} words</p>
                </div>
              )}

              {(item.evidenceType === "screenshot" || item.evidenceType === "both") && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Screenshots / Supporting Evidence</label>
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
                    <Upload size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-500">Click to upload images</span>
                    <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
                  </label>
                  {resp.screenshots && resp.screenshots.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {resp.screenshots.map((ss, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-gray-200 group">
                          <img src={ss.data} alt={ss.name} className="w-full h-20 object-cover" />
                          <button
                            onClick={() => removeShot(i)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                          >×</button>
                          <p className="text-xs text-gray-400 px-1 py-0.5 truncate bg-white">{ss.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex gap-2">
                  {activeIdx > 0 && (
                    <button onClick={() => setActiveIdx(i => i - 1)} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">← Prev</button>
                  )}
                  {activeIdx < att.checklist.length - 1 && (
                    <button onClick={() => setActiveIdx(i => i + 1)} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Next →</button>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit for Review"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REVIEW VIEW
// ═══════════════════════════════════════════════════════════════

function ReviewView({ att, sub, teamId, users, onSave, onBack }) {
  const team = users.find(u => u.id === teamId);
  const [tab, setTab] = useState("ai");
  const [decision, setDecision] = useState((sub && sub.manualReview) ? sub.manualReview.status : "approved");
  const [comment, setComment] = useState((sub && sub.manualReview) ? sub.manualReview.overallComments : "");
  const [itemStatuses, setItemStatuses] = useState(
    (sub && sub.manualReview && sub.manualReview.itemStatuses)
      ? sub.manualReview.itemStatuses
      : Object.fromEntries(att.checklist.map(c => [c.id, "pending"]))
  );
  const [saved, setSaved] = useState(false);

  const ai = sub ? sub.aiReview : null;
  // FIX: safe fallback — use "gray" which is now defined
  const ac = aiColorStyle[ai ? ai.color : "gray"] || aiColorStyle.gray;

  if (!sub) return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
        <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
        <p>No submission found from {team ? team.name : teamId}.</p>
      </div>
    </div>
  );

  function handleSave() {
    setSaved(true);
    onSave(sub.id, { status: decision, overallComments: comment, itemStatuses });
  }

  const dueStr = new Date(att.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const subStr = new Date(sub.submittedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back to dashboard
      </button>

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <Badge label={att.scheme} style={schemeStyle[att.scheme] || "bg-gray-100 text-gray-600"} />
          <h2 className="text-lg font-bold text-gray-800 mt-1">{att.name}</h2>
          <p className="text-sm text-gray-500">
            Submitted by <span className="font-medium text-gray-700">{team ? team.name : teamId}</span> on {subStr} · Due {dueStr}
          </p>
        </div>
        {ai && (
          <div className={`${ac.bg} border ${ac.border} rounded-xl px-5 py-3 text-center flex-shrink-0`}>
            <p className={`text-2xl font-bold ${ac.text}`}>{ai.overall}%</p>
            <p className={`text-xs font-semibold ${ac.text}`}>{ai.label}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {[["ai","🤖 AI Review"],["manual","👤 Manual Review"],["evidence","📎 Evidence"]].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === t ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >{l}</button>
        ))}
      </div>

      {/* ── AI Review Tab ── */}
      {tab === "ai" && (
        <div className="space-y-4">
          {ai ? (
            <>
              <div className={`${ac.bg} border ${ac.border} rounded-xl p-5`}>
                <p className="font-semibold text-gray-800 mb-1 text-sm">AI Overall Assessment</p>
                <p className="text-sm text-gray-600 mb-4">{ai.comment}</p>
                <div className="grid grid-cols-3 gap-4">
                  <ScoreBar label="Completeness" value={ai.completeness} barClass={ac.bar} />
                  <ScoreBar label="Quality"       value={ai.quality}       barClass={ac.bar} />
                  <ScoreBar label="Screenshots"   value={ai.screenshot}    barClass={ac.bar} />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <p className="px-4 py-3 text-xs font-semibold text-gray-400 border-b border-gray-50">ITEM-LEVEL COMMENTS</p>
                {att.checklist.map(ci => {
                  const comments = (ai.itemComments && ai.itemComments[ci.id]) ? ai.itemComments[ci.id] : [];
                  const r = sub.responses ? sub.responses.find(r => r.checklistItemId === ci.id) : null;
                  return (
                    <div key={ci.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{ci.title}</span>
                        {ci.required && <span className="text-xs text-red-400 bg-red-50 px-1 py-0.5 rounded">Required</span>}
                        {r && r.textResponse && r.textResponse.trim() && (
                          <span className="text-xs text-green-600 bg-green-50 px-1 py-0.5 rounded ml-auto">Has response</span>
                        )}
                      </div>
                      {comments.length > 0 ? (
                        <ul className="space-y-1">
                          {comments.map((c, i) => (
                            <li key={i} className={`text-xs flex items-start gap-1.5 ${
                              c.type === "error" ? "text-red-600" :
                              c.type === "warn"  ? "text-orange-600" :
                              c.type === "ok"    ? "text-green-600" : "text-gray-500"
                            }`}>
                              <span className="flex-shrink-0 mt-0.5">
                                {c.type === "error" ? "✗" : c.type === "warn" ? "⚠" : c.type === "ok" ? "✓" : "ℹ"}
                              </span>
                              <span>{c.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-green-600">✓ No issues flagged</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-400">
              <p className="text-sm">AI review not yet generated for this submission.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Manual Review Tab ── */}
      {tab === "manual" && (
        <div className="space-y-4">
          {saved && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2">
              <span>✓</span> Review saved and team notified.
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">Overall Decision</p>
            <div className="flex gap-2 mb-4">
              {[
                { v: "approved", l: "✓  Approve",         cls: "border-green-500 bg-green-50 text-green-700"    },
                { v: "partial",  l: "◑  Partial Approve",  cls: "border-yellow-400 bg-yellow-50 text-yellow-700" },
                { v: "rejected", l: "✗  Reject & Return",  cls: "border-red-500 bg-red-50 text-red-700"          },
              ].map(({ v, l, cls }) => (
                <button
                  key={v}
                  onClick={() => setDecision(v)}
                  className={`flex-1 py-2.5 text-sm rounded-lg border-2 font-medium transition-all ${decision === v ? cls : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >{l}</button>
              ))}
            </div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Comments to team</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 h-28"
              placeholder="Provide clear feedback — what was done well, what needs to be improved, and any specific actions required before resubmission."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          {decision !== "approved" && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <p className="px-4 py-3 text-xs font-semibold text-gray-400 border-b border-gray-50">LINE-BY-LINE REVIEW</p>
              {att.checklist.map(ci => (
                <div key={ci.id} className="px-4 py-3 border-b border-gray-50 last:border-0 flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-700">{ci.title}</span>
                    {ci.required && <span className="text-red-400 ml-1 text-xs">*</span>}
                  </div>
                  <div className="flex gap-1.5">
                    {[
                      { v: "approved", l: "✓", on: "ring-2 ring-green-400 bg-green-100 text-green-700",  off: "bg-gray-50 text-gray-400 hover:bg-green-50 hover:text-green-600"  },
                      { v: "flagged",  l: "⚠", on: "ring-2 ring-orange-400 bg-orange-100 text-orange-700", off: "bg-gray-50 text-gray-400 hover:bg-orange-50 hover:text-orange-600" },
                      { v: "rejected", l: "✗", on: "ring-2 ring-red-400 bg-red-100 text-red-700",        off: "bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600"      },
                      { v: "pending",  l: "?", on: "ring-2 ring-gray-400 bg-gray-200 text-gray-700",     off: "bg-gray-50 text-gray-400"                                          },
                    ].map(({ v, l, on, off }) => (
                      <button
                        key={v}
                        onClick={() => setItemStatuses(s => ({ ...s, [ci.id]: v }))}
                        className={`w-8 h-8 rounded text-sm font-medium transition-all ${itemStatuses[ci.id] === v ? on : off}`}
                      >{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Save Review &amp; Notify Team
            </button>
          </div>
        </div>
      )}

      {/* ── Evidence Tab ── */}
      {tab === "evidence" && (
        <div className="space-y-3">
          {att.checklist.map(ci => {
            const r = sub.responses ? sub.responses.find(r => r.checklistItemId === ci.id) : null;
            const hasText  = r && r.textResponse && r.textResponse.trim();
            const hasShots = r && r.screenshots && r.screenshots.length > 0;
            return (
              <div key={ci.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{ci.title}</span>
                  {ci.required && <span className="text-xs text-red-400 bg-red-50 px-1 py-0.5 rounded">Required</span>}
                  {!hasText && !hasShots && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded ml-auto">No response</span>
                  )}
                </div>
                {hasText && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-2">
                    <p className="text-xs font-medium text-gray-400 mb-1">TEXT RESPONSE</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.textResponse}</p>
                  </div>
                )}
                {hasShots && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1.5">SCREENSHOTS ({r.screenshots.length})</p>
                    <div className="grid grid-cols-4 gap-2">
                      {r.screenshots.map((ss, i) => (
                        <div key={i} className="rounded-lg overflow-hidden border border-gray-200">
                          <img src={ss.data} alt={ss.name} className="w-full h-20 object-cover" />
                          <p className="text-xs text-gray-400 px-1 py-0.5 truncate">{ss.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN — USERS
// ═══════════════════════════════════════════════════════════════

function AdminUsers({ users, attestations, onAdd, onRemove, onUpdateAttestations }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "crew" });
  const [expandedId, setExpandedId] = useState(null);

  function handleAdd() {
    if (!form.name.trim()) return;
    onAdd({ name: form.name.trim(), role: form.role, assignedAttestations: [] });
    setForm({ name: "", role: "crew" }); setShowAdd(false);
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Team Management</h1>
          <p className="text-sm text-gray-500">Manage users and their attestation assignments</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus size={14} /> Add User
        </button>
      </div>

      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">New User</p>
          <div className="flex gap-2">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name or team name"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="crew">Crew</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.name} role={u.role} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{u.name}</p>
                <p className="text-xs text-gray-400 capitalize">{u.role} · {u.assignedAttestations.length} attestation(s)</p>
              </div>
              <button
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
              >
                {expandedId === u.id ? "Done" : "Manage Assignments"}
              </button>
              {u.role !== "admin" && (
                <button onClick={() => onRemove(u.id)} className="p-1.5 text-red-300 hover:text-red-500 rounded hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {expandedId === u.id && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-50 bg-gray-50">
                <p className="text-xs font-medium text-gray-400 mb-2">ATTESTATION ASSIGNMENTS</p>
                <div className="space-y-1">
                  {attestations.map(a => {
                    const on = u.assignedAttestations.includes(a.id);
                    return (
                      <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => {
                          const next = on
                            ? u.assignedAttestations.filter(id => id !== a.id)
                            : [...u.assignedAttestations, a.id];
                          onUpdateAttestations(u.id, next);
                        }} className="rounded" />
                        <span className="text-xs text-gray-700 flex-1">{a.name}</span>
                        <Badge label={a.scheme} style={schemeStyle[a.scheme] || "bg-gray-100 text-gray-500"} />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN — ATTESTATIONS
// ═══════════════════════════════════════════════════════════════

function AdminAttestations({ attestations, users, onAdd, onRemove, onUpdateChecklist, onUpdateTeams }) {
  const [expandedId, setExpandedId] = useState(null);
  const [innerTab, setInnerTab] = useState({});
  const [showNewAtt, setShowNewAtt] = useState(false);
  const [attForm, setAttForm] = useState({ name: "", scheme: "AusPayNet", dueDate: "", description: "" });
  const [addingItemFor, setAddingItemFor] = useState(null);
  const [itemForm, setItemForm] = useState({ title: "", description: "", evidenceType: "both", required: true });

  const crewUsers = users.filter(u => u.role === "crew");

  function handleAddAtt() {
    if (!attForm.name.trim() || !attForm.dueDate) return;
    onAdd(attForm);
    setAttForm({ name: "", scheme: "AusPayNet", dueDate: "", description: "" });
    setShowNewAtt(false);
  }

  function handleAddItem(attId, checklist) {
    if (!itemForm.title.trim()) return;
    onUpdateChecklist(attId, [...checklist, { ...itemForm, id: uid() }]);
    setItemForm({ title: "", description: "", evidenceType: "both", required: true });
    setAddingItemFor(null);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Attestation Manager</h1>
          <p className="text-sm text-gray-500">Create attestations, build checklists, and assign teams</p>
        </div>
        <button onClick={() => setShowNewAtt(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus size={14} /> New Attestation
        </button>
      </div>

      {showNewAtt && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">New Attestation</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={attForm.name} onChange={e => setAttForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Attestation name"
              className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <select value={attForm.scheme} onChange={e => setAttForm(f => ({ ...f, scheme: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option>AusPayNet</option>
              <option>AP+</option>
            </select>
            <input type="date" value={attForm.dueDate} onChange={e => setAttForm(f => ({ ...f, dueDate: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={attForm.description} onChange={e => setAttForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddAtt} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Create</button>
            <button onClick={() => setShowNewAtt(false)} className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {attestations.map(att => {
          const tab = innerTab[att.id] || "checklist";
          return (
            <div key={att.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <Badge label={att.scheme} style={schemeStyle[att.scheme] || "bg-gray-100 text-gray-500"} />
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{att.name}</p>
                  <p className="text-xs text-gray-400">
                    Due {new Date(att.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{att.checklist.length} checklist item{att.checklist.length !== 1 ? "s" : ""}
                    {" · "}{att.assignedTeams.length} team{att.assignedTeams.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button onClick={() => setExpandedId(expandedId === att.id ? null : att.id)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                  {expandedId === att.id ? "Collapse" : "Edit"}
                </button>
                <button onClick={() => onRemove(att.id)} className="p-1.5 text-red-300 hover:text-red-500 rounded hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              </div>

              {expandedId === att.id && (
                <div className="border-t border-gray-50">
                  <div className="flex gap-1 p-3 bg-gray-50 border-b border-gray-100">
                    {[["checklist","📋 Checklist"],["teams","👥 Teams"]].map(([t, l]) => (
                      <button key={t}
                        onClick={() => setInnerTab(s => ({ ...s, [att.id]: t }))}
                        className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tab === t ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >{l}</button>
                    ))}
                  </div>

                  {tab === "checklist" && (
                    <div className="p-4">
                      <div className="space-y-2 mb-3">
                        {att.checklist.map((ci, i) => (
                          <div key={ci.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 group">
                            <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-700">{ci.title} {ci.required && <span className="text-red-400">*</span>}</p>
                              <p className="text-xs text-gray-400 line-clamp-1">{ci.description}</p>
                              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 inline-block capitalize">{ci.evidenceType}</span>
                            </div>
                            <button
                              onClick={() => onUpdateChecklist(att.id, att.checklist.filter(c => c.id !== ci.id))}
                              className="text-red-200 hover:text-red-400 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            ><X size={13} /></button>
                          </div>
                        ))}
                      </div>

                      {addingItemFor === att.id ? (
                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                          <input value={itemForm.title} onChange={e => setItemForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Item title"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                          <textarea value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Instructions for teams — what to include, what evidence is expected"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-2 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                          <div className="flex gap-3 mb-3 items-center">
                            <select value={itemForm.evidenceType} onChange={e => setItemForm(f => ({ ...f, evidenceType: e.target.value }))}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300">
                              <option value="both">Text + Screenshot</option>
                              <option value="text">Text only</option>
                              <option value="screenshot">Screenshot only</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                              <input type="checkbox" checked={itemForm.required} onChange={e => setItemForm(f => ({ ...f, required: e.target.checked }))} />
                              Required
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleAddItem(att.id, att.checklist)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Add Item</button>
                            <button onClick={() => setAddingItemFor(null)} className="px-3 py-1.5 text-gray-500 text-xs rounded-lg hover:bg-gray-100">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAddingItemFor(att.id)} className="w-full py-2.5 border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 rounded-xl flex items-center justify-center gap-1 transition-colors">
                          <Plus size={12} /> Add checklist item
                        </button>
                      )}
                    </div>
                  )}

                  {tab === "teams" && (
                    <div className="p-4">
                      <p className="text-xs text-gray-400 mb-3">Select which crew teams are assigned to this attestation:</p>
                      <div className="space-y-1">
                        {crewUsers.map(u => {
                          const on = att.assignedTeams.includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={on} onChange={() => {
                                const next = on
                                  ? att.assignedTeams.filter(id => id !== u.id)
                                  : [...att.assignedTeams, u.id];
                                onUpdateTeams(att.id, next);
                              }} className="rounded" />
                              <Avatar name={u.name} role={u.role} sm />
                              <span className="text-xs font-medium text-gray-700 flex-1">{u.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [attestations, setAttestations] = useState(INITIAL_ATTESTATIONS);
  const [submissions, setSubmissions] = useState(INITIAL_SUBMISSIONS);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [selectedAtt, setSelectedAtt] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={u => { setCurrentUser(u); setView("dashboard"); }} />;
  }

  const myAttestations = attestations.filter(a =>
    currentUser.role === "admin" || currentUser.role === "reviewer"
      ? true
      : currentUser.assignedAttestations.includes(a.id)
  );

  function handleSubmitEvidence(attId, teamId, responses) {
    const att = attestations.find(a => a.id === attId);
    const aiReview = computeAIReview(responses, att.checklist);
    const existing = submissions.find(s => s.attestationId === attId && s.teamId === teamId);
    if (existing) {
      setSubmissions(prev => prev.map(s =>
        s.id === existing.id
          ? { ...s, responses, status: "submitted", submittedAt: new Date().toISOString(), aiReview, manualReview: null }
          : s
      ));
    } else {
      setSubmissions(prev => [...prev, {
        id: uid(), attestationId: attId, teamId,
        submittedAt: new Date().toISOString(),
        status: "submitted", responses, aiReview, manualReview: null,
      }]);
    }
    setView("dashboard");
  }

  function handleManualReview(subId, data) {
    setSubmissions(prev => prev.map(s =>
      s.id === subId
        ? { ...s, status: data.status, manualReview: { ...data, reviewedBy: currentUser.name, reviewedAt: new Date().toISOString() } }
        : s
    ));
    setView("dashboard");
  }

  const isAdminOrReviewer = currentUser.role !== "crew";

  function addNewUser(u) { setUsers(prev => [...prev, { ...u, id: uid() }]); }
  function removeUser(id) { setUsers(prev => prev.filter(u => u.id !== id)); }
  function updateUserAtts(userId, ids) { setUsers(prev => prev.map(u => u.id === userId ? { ...u, assignedAttestations: ids } : u)); }
  function addNewAtt(a) { setAttestations(prev => [...prev, { ...a, id: uid(), checklist: [], assignedTeams: [] }]); }
  function removeAtt(id) { setAttestations(prev => prev.filter(a => a.id !== id)); }
  function updateChecklist(attId, cl) { setAttestations(prev => prev.map(a => a.id === attId ? { ...a, checklist: cl } : a)); }
  function updateTeams(attId, teams) { setAttestations(prev => prev.map(a => a.id === attId ? { ...a, assignedTeams: teams } : a)); }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        user={currentUser}
        view={view}
        setView={setView}
        onLogout={() => { setCurrentUser(null); setView("dashboard"); }}
      />

      <main className="flex-1 overflow-auto">
        {view === "dashboard" && (
          <Dashboard
            user={currentUser}
            attestations={myAttestations}
            submissions={submissions}
            users={users}
            onSubmit={att => { setSelectedAtt(att); setView("submit"); }}
            onReview={(att, tid) => { setSelectedAtt(att); setSelectedTeamId(tid); setView("review"); }}
          />
        )}

        {view === "submit" && selectedAtt && (
          <SubmitView
            att={selectedAtt}
            existingSub={submissions.find(s => s.attestationId === selectedAtt.id && s.teamId === currentUser.id) || null}
            onSubmit={responses => handleSubmitEvidence(selectedAtt.id, currentUser.id, responses)}
            onBack={() => setView("dashboard")}
          />
        )}

        {view === "review" && selectedAtt && (
          <ReviewView
            att={selectedAtt}
            sub={submissions.find(s => s.attestationId === selectedAtt.id && s.teamId === selectedTeamId && s.status !== "draft") || null}
            teamId={selectedTeamId}
            users={users}
            onSave={handleManualReview}
            onBack={() => setView("dashboard")}
          />
        )}

        {view === "admin-users" && isAdminOrReviewer && (
          <AdminUsers
            users={users}
            attestations={attestations}
            onAdd={addNewUser}
            onRemove={removeUser}
            onUpdateAttestations={updateUserAtts}
          />
        )}

        {view === "admin-attestations" && isAdminOrReviewer && (
          <AdminAttestations
            attestations={attestations}
            users={users}
            onAdd={addNewAtt}
            onRemove={removeAtt}
            onUpdateChecklist={updateChecklist}
            onUpdateTeams={updateTeams}
          />
        )}
      </main>
    </div>
  );
}
