/* Project Alpha — Dashboard (Sprint 1: real API + DB) */

const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest"
};

// Registered in the OAuth architecture but not implemented yet — see
// server/src/lib/oauth/providers/{tiktok,pinterest}.js.
const COMING_SOON_PLATFORMS = new Set(["tiktok", "pinterest"]);

// Sprint 11 — AI Smart Scheduler
const SCHEDULER_PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok", "pinterest"];
const PRIORITY_LABELS = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

const SECTION_META = {
  dashboard: { title: "Dashboard", subtitle: "Welcome back — here's your automation overview" },
  schedule: { title: "Scheduler", subtitle: "Calendar, publish queue, and post status" },
  connect: { title: "Social Connections", subtitle: "OAuth for Instagram, Facebook, YouTube, LinkedIn, and X" },
  "clip-ai": { title: "Clip AI", subtitle: "Upload long-form video, get real AI-detected viral clips" },
  "top-performing-clips": { title: "Top Performing Clips", subtitle: "Ranked by real platform analytics" },
  "ai-tools": { title: "AI Content Generator", subtitle: "Generate captions with OpenAI" },
  "ai-agents": { title: "AI Agents", subtitle: "Available in a later sprint" },
  leads: { title: "Leads", subtitle: "Search, filter, and manage your lead database" },
  crm: { title: "CRM Pipeline", subtitle: "Drag-and-drop kanban synced with PostgreSQL" },
  analytics: { title: "Analytics", subtitle: "Publishing performance from your own data" },
  inbox: { title: "Inbox", subtitle: "Available in a later sprint" },
  settings: { title: "Settings", subtitle: "Manage your profile and preferences" }
};

let navigateToSection = () => {};
let cachedPosts = [];
let cachedConnections = {};
let lastAiResult = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.AlphaAuth || !window.AlphaAPI) return;
  const ok = await AlphaAuth.requireAuth("./login.html");
  if (!ok) return;

  initAuthUI();
  initMobileSidebar();
  navigateToSection = initSidebarNav();
  initModals();
  initQuickActions();
  initSchedulerViews();
  initScheduleForm();
  initConnectPages();
  initAITools();
  initLeadsCrm();
  initSettings();
  initBilling();
  initAnalytics();
  initKeyboardA11y();
  initOAuthQueryFeedback();
  disableFutureSprintMocks();

  await refreshAllData();
  startDashboardPolling();
  handleBillingQueryFeedback();
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function showUndoToast(message, onUndo, duration = 6000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast toast-info toast-undo";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "toast-undo-btn";
  undoBtn.textContent = "Undo";
  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  };
  undoBtn.addEventListener("click", async () => {
    dismiss();
    await onUndo();
  });
  toast.appendChild(text);
  toast.appendChild(undoBtn);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(dismiss, duration);
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  const spinner = btn.querySelector(".btn-spinner");
  const label = btn.querySelector(".btn-label");
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
  if (spinner) spinner.hidden = !loading;
  if (label && loading) label.dataset.prev = label.textContent;
}

function showError(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector("button, [href], input, select, textarea")?.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  if (!document.querySelector(".pa-modal:not([hidden])")) {
    document.body.classList.remove("modal-open");
  }
}

function initModals() {
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.getAttribute("data-close-modal")));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".pa-modal:not([hidden])").forEach((modal) => closeModal(modal.id));
  });
}

function initKeyboardA11y() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("sidebar")?.classList.remove("open");
      document.getElementById("sidebar-overlay")?.classList.remove("visible");
      document.body.classList.remove("sidebar-open");
    }
  });
}

function initAuthUI() {
  AlphaAuth.getSession().then((session) => {
    if (session?.name) updateProfileName(session.name);
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await AlphaAuth.logout();
    showToast("Logged out", "info");
    window.location.href = "./login.html";
  });
}

function updateProfileName(name) {
  const profile = document.getElementById("user-greeting");
  const img = document.getElementById("user-avatar");
  if (profile && name) profile.textContent = `Welcome, ${name.split(" ")[0]}!`;
  if (img && name) img.alt = `${name} avatar`;
}

function initMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const openBtn = document.getElementById("menu-toggle");
  const closeBtn = document.getElementById("sidebar-close");

  const open = () => {
    sidebar?.classList.add("open");
    if (overlay) {
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add("visible"));
    }
    document.body.classList.add("sidebar-open");
  };
  const close = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("visible");
    document.body.classList.remove("sidebar-open");
    setTimeout(() => {
      if (overlay && !sidebar?.classList.contains("open")) overlay.hidden = true;
    }, 250);
  };

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) close();
  });
}

function initSidebarNav() {
  const sections = document.querySelectorAll(".dashboard-section");
  const titleEl = document.getElementById("dash-title");
  const subtitleEl = document.getElementById("dash-subtitle");

  const showSection = (targetId) => {
    if (!targetId) return;
    const platformIds = ["instagram", "facebook", "linkedin", "x", "youtube"];
    let sectionToShow = targetId;
    if (platformIds.includes(targetId)) sectionToShow = "connect";

    sections.forEach((section) => {
      section.classList.toggle("active", section.id === sectionToShow);
    });

    document.querySelectorAll(".sidebar-nav a").forEach((link) => link.classList.remove("active"));
    const mainLink = document.querySelector(`.sidebar-nav a[data-section="${sectionToShow}"]`);
    mainLink?.classList.add("active");

    const meta = SECTION_META[sectionToShow];
    if (meta) {
      if (titleEl) titleEl.textContent = meta.title;
      if (subtitleEl) subtitleEl.textContent = meta.subtitle;
    }

    if (window.innerWidth <= 768) {
      document.getElementById("sidebar")?.classList.remove("open");
      document.getElementById("sidebar-overlay")?.classList.remove("visible");
      document.body.classList.remove("sidebar-open");
    }

    if (history.replaceState) history.replaceState(null, "", `#${sectionToShow}`);
  };

  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      e.preventDefault();
      showSection(href.substring(1));
    });
  });

  const hash = window.location.hash.replace("#", "");
  const initial = SECTION_META[hash] ? hash : platformSection(hash) || "dashboard";
  showSection(initial);
  return showSection;
}

function platformSection(id) {
  return ["instagram", "facebook", "linkedin", "x", "youtube"].includes(id) ? "connect" : null;
}

function initQuickActions() {
  document.querySelectorAll("[data-nav-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateToSection(btn.getAttribute("data-nav-section"));
      if (btn.hasAttribute("data-open-schedule")) {
        setTimeout(() => openScheduleModal(), 120);
      }
    });
  });
}

let cachedActivity = [];
let cachedLeads = [];
let cachedFounderStats = {};
let leadStats = { total: 0, open: 0, byStage: {}, followUpsDue: 0 };
let selectedLeadId = null;
let dashboardPollTimer = null;
let currentUser = null;

const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const LEAD_STAGE_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost"
};

async function refreshAllData() {
  try {
    const [connData, postsData, activityData, leadsData, statsData, meData, founderData] =
      await Promise.all([
        AlphaAPI.api("/api/connections"),
        AlphaAPI.api("/api/posts?includeArchived=1"),
        AlphaAPI.api("/api/activity?limit=30"),
        AlphaAPI.api(buildLeadsQuery()),
        AlphaAPI.api("/api/leads/stats"),
        AlphaAPI.api("/api/auth/me"),
        AlphaAPI.api("/api/posts/founder-stats")
      ]);
    cachedConnections = connData.connections || {};
    cachedPosts = postsData.posts || [];
    cachedActivity = activityData.activity || [];
    cachedLeads = leadsData.leads || [];
    leadStats = statsData;
    currentUser = meData.user || null;
    cachedFounderStats = founderData.stats || {};
    renderConnections();
    renderOverview();
    renderFounderDashboard();
    renderCalendar();
    renderScheduledList();
    renderPublishQueue();
    renderPublishHistory();
    renderUpcoming();
    renderActivityFromData();
    renderWeekChart();
    renderLeadStats();
    renderLeadsTable();
    renderCrmBoard();
  } catch (err) {
    showToast(err.message || "Failed to load dashboard data.", "error");
  }
}

function buildLeadsQuery() {
  const params = new URLSearchParams();
  const q = document.getElementById("leads-search")?.value?.trim();
  const stage = document.getElementById("leads-filter-stage")?.value;
  const followUp = document.getElementById("leads-filter-followup")?.value;
  const tag = document.getElementById("leads-filter-tag")?.value?.trim();
  if (q) params.set("q", q);
  if (stage) params.set("stage", stage);
  if (followUp) params.set("followUp", followUp);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  return qs ? `/api/leads?${qs}` : "/api/leads";
}

function startDashboardPolling() {
  if (dashboardPollTimer) return;
  dashboardPollTimer = setInterval(() => {
    refreshAllData().catch(() => {});
  }, 8000);
}

function renderOverview() {
  const connectedCount = Object.values(cachedConnections).filter((c) => c.connected).length;
  const activeConnections =
    cachedFounderStats.activeConnections ??
    Object.values(cachedConnections).filter((c) => c.connected && !c.reconnectRequired).length;
  const upcoming = cachedPosts.filter(
    (p) => p.status === "scheduled" || p.status === "processing"
  );
  const published = cachedPosts.filter((p) => p.status === "published").length;
  const failed = cachedPosts.filter((p) => p.status === "failed").length;

  setStat("stat-connected", connectedCount);
  setStat("stat-active-connections", activeConnections);
  setStat("scheduled-count", upcoming.length);
  setStat("stat-published", published);
  setStat("stat-failed", failed);
  setText("stat-connected-meta", "of 5 platforms");
  setText(
    "stat-active-meta",
    activeConnections ? "Healthy tokens" : "Connect Instagram or Facebook"
  );
  setText("stat-scheduled-meta", upcoming.length ? `${upcoming.length} in queue` : "Queue is empty");
  setText("stat-published-meta", published ? "Live Graph publish" : "None published yet");
  setText("stat-failed-meta", failed ? "Retry from queue" : "No failures");
}

function renderFounderDashboard() {
  const s = cachedFounderStats || {};
  setStat("founder-connected", s.connectedAccounts ?? 0);
  setStat("founder-active", s.activeConnections ?? 0);
  setStat("founder-scheduled", s.scheduledPosts ?? 0);
  setStat("founder-published", s.publishedPosts ?? 0);
  setStat("founder-failed", s.failedPosts ?? 0);
  loadPlatformAdmin().catch(() => {});
}

async function loadPlatformAdmin() {
  const panel = document.getElementById("platform-admin-panel");
  const summary = document.getElementById("platform-admin-summary");
  const list = document.getElementById("platform-admin-users");
  if (!panel) return;
  try {
    const data = await AlphaAPI.api("/api/admin/overview");
    panel.hidden = false;
    const o = data.overview || {};
    if (summary) {
      summary.textContent = `${o.users || 0} users · ${o.paidSubscribers || 0} paid · ${o.pastDue || 0} past due · ${o.onboarded || 0} onboarded · ${o.publishedPosts || 0} published`;
    }
    if (list) {
      list.innerHTML = "";
      (data.recentUsers || []).slice(0, 10).forEach((u) => {
        const li = document.createElement("li");
        li.textContent = `${u.email} · ${u.subscriptionStatus || "none"} · ${u.workspaceName || "—"}`;
        list.appendChild(li);
      });
    }
  } catch {
    panel.hidden = true;
  }
}

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderWeekChart() {
  const chart = document.getElementById("week-chart");
  if (!chart) return;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = days.map(() => 0);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);

  cachedPosts.forEach((post) => {
    const d = new Date(post.scheduledAt || post.datetime);
    const diff = Math.floor((d - start) / (24 * 60 * 60 * 1000));
    if (diff >= 0 && diff < 7) values[diff] += 1;
  });

  const max = Math.max(...values, 1);
  chart.innerHTML = days
    .map((day, i) => {
      const height = Math.round((values[i] / max) * 100);
      return `<div class="week-bar-col">
        <div class="week-bar-track">
          <div class="week-bar" style="--bar-h:${Math.max(height, values[i] ? 12 : 4)}%" title="${values[i]} posts">
            <span class="week-bar-value">${values[i]}</span>
          </div>
        </div>
        <span class="week-bar-label">${day}</span>
      </div>`;
    })
    .join("");
}

function renderActivityFromData() {
  const list = document.getElementById("activity-list");
  const empty = document.getElementById("activity-empty");
  if (!list) return;
  list.innerHTML = "";

  const items = (cachedActivity || []).slice(0, 10).map((row) => ({
    text: row.message,
    time: new Date(row.createdAt).toLocaleString(),
    type: row.type || "schedule"
  }));

  if (!items.length) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "No recent activity yet.";
    }
    return;
  }
  if (empty) empty.hidden = true;
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "activity-item";
    li.innerHTML = `<span class="activity-dot type-${escapeHtml(item.type)}"></span>
      <div><strong>${escapeHtml(item.text)}</strong><small>${escapeHtml(item.time)}</small></div>`;
    list.appendChild(li);
  });
}

function renderUpcoming() {
  const list = document.getElementById("upcoming-list");
  const empty = document.getElementById("upcoming-empty");
  if (!list) return;
  const posts = cachedPosts
    .filter((p) => p.status === "scheduled" || p.status === "processing")
    .sort((a, b) => new Date(a.scheduledAt || a.datetime) - new Date(b.scheduledAt || b.datetime))
    .slice(0, 4);

  list.innerHTML = "";
  if (!posts.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  posts.forEach((post) => {
    const li = document.createElement("li");
    li.className = "upcoming-item";
    const when = new Date(post.scheduledAt || post.datetime).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const caption = post.caption || post.content || "";
    li.innerHTML = `<span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
      <div><strong>${escapeHtml(caption.slice(0, 64))}${caption.length > 64 ? "…" : ""}</strong>
      <small>${escapeHtml(statusLabel(post.status))} · ${escapeHtml(when)}</small></div>`;
    list.appendChild(li);
  });
}

function statusLabel(status) {
  const map = {
    draft: "Draft",
    scheduled: "Scheduled",
    processing: "Processing",
    published: "Published",
    failed: "Failed",
    cancelled: "Cancelled"
  };
  return map[status] || status || "Unknown";
}

function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status || "scheduled")}">${escapeHtml(statusLabel(status))}</span>`;
}

/* ---------- Scheduler ---------- */

let calendarViewDate = new Date();
let weekViewDate = startOfWeek(new Date());
let dayViewDate = new Date();
let schedulerView = "calendar";
let schedulerFilters = { platform: "", status: "", source: "" };
let queueSubTab = "all";

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHourLabel(hour) {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

/** Applies the scheduler filters bar. Archived posts are hidden unless explicitly filtered for. */
function filteredPosts(base = cachedPosts) {
  return base.filter((p) => {
    if (schedulerFilters.status) {
      if (p.status !== schedulerFilters.status) return false;
    } else if (p.status === "archived") {
      return false;
    }
    if (schedulerFilters.platform && p.platform !== schedulerFilters.platform) return false;
    if (schedulerFilters.source && (p.source || "manual") !== schedulerFilters.source) return false;
    return true;
  });
}

async function reschedulePost(postId, newDate) {
  const post = cachedPosts.find((p) => p.id === postId);
  if (!post) return;
  if (!["draft", "scheduled", "failed"].includes(post.status)) {
    showToast("Only draft, scheduled, or failed posts can be rescheduled.", "error");
    return;
  }
  try {
    await AlphaAPI.api(`/api/posts/${postId}`, {
      method: "PUT",
      body: {
        platform: post.platform,
        caption: post.caption,
        mediaUrl: post.mediaUrl || "",
        media: post.media || [],
        status: post.status === "draft" ? "draft" : "scheduled",
        priority: post.priority || "normal",
        scheduledAt: newDate.toISOString()
      }
    });
    showToast("Post rescheduled");
    await refreshAllData();
  } catch (err) {
    showToast(err.message || "Reschedule failed.", "error");
  }
}

function renderSchedulerActiveView() {
  if (schedulerView === "calendar") renderCalendar();
  else if (schedulerView === "week") renderWeekView();
  else if (schedulerView === "day") renderDayView();
  else if (schedulerView === "list") renderScheduledList();
  else if (schedulerView === "queue") renderPublishQueue();
  else if (schedulerView === "history") renderPublishHistory();
}

function initSchedulerViews() {
  const views = {
    calendar: document.getElementById("scheduler-calendar-view"),
    week: document.getElementById("scheduler-week-view"),
    day: document.getElementById("scheduler-day-view"),
    list: document.getElementById("scheduler-list-view"),
    queue: document.getElementById("scheduler-queue-view"),
    history: document.getElementById("scheduler-history-view")
  };

  document.querySelectorAll("[data-scheduler-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-scheduler-view");
      schedulerView = view;
      document.querySelectorAll("[data-scheduler-view]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      Object.entries(views).forEach(([key, el]) => {
        if (el) el.hidden = key !== view;
      });
      renderSchedulerActiveView();
    });
  });

  document.getElementById("open-schedule-modal")?.addEventListener("click", () => openScheduleModal());
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-today")?.addEventListener("click", () => {
    const now = new Date();
    calendarViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
  });

  document.getElementById("week-prev")?.addEventListener("click", () => {
    weekViewDate.setDate(weekViewDate.getDate() - 7);
    renderWeekView();
  });
  document.getElementById("week-next")?.addEventListener("click", () => {
    weekViewDate.setDate(weekViewDate.getDate() + 7);
    renderWeekView();
  });
  document.getElementById("week-today")?.addEventListener("click", () => {
    weekViewDate = startOfWeek(new Date());
    renderWeekView();
  });

  document.getElementById("day-prev")?.addEventListener("click", () => {
    dayViewDate = new Date(dayViewDate);
    dayViewDate.setDate(dayViewDate.getDate() - 1);
    renderDayView();
  });
  document.getElementById("day-next")?.addEventListener("click", () => {
    dayViewDate = new Date(dayViewDate);
    dayViewDate.setDate(dayViewDate.getDate() + 1);
    renderDayView();
  });
  document.getElementById("day-today")?.addEventListener("click", () => {
    dayViewDate = new Date();
    renderDayView();
  });

  const platformFilter = document.getElementById("filter-platform");
  if (platformFilter) {
    SCHEDULER_PLATFORMS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = PLATFORM_LABELS[p] || p;
      platformFilter.appendChild(opt);
    });
  }
  const onFiltersChanged = () => {
    schedulerFilters = {
      platform: document.getElementById("filter-platform")?.value || "",
      status: document.getElementById("filter-status")?.value || "",
      source: document.getElementById("filter-source")?.value || ""
    };
    renderSchedulerActiveView();
  };
  document.getElementById("filter-platform")?.addEventListener("change", onFiltersChanged);
  document.getElementById("filter-status")?.addEventListener("change", onFiltersChanged);
  document.getElementById("filter-source")?.addEventListener("change", onFiltersChanged);
  document.getElementById("filters-clear")?.addEventListener("click", () => {
    ["filter-platform", "filter-status", "filter-source"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    onFiltersChanged();
  });

  document.querySelectorAll("[data-queue-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      queueSubTab = btn.getAttribute("data-queue-tab");
      document.querySelectorAll("[data-queue-tab]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderPublishQueue();
    });
  });

  initCloneSeriesModal();

  document.getElementById("run-connection-health")?.addEventListener("click", async () => {
    const summary = document.getElementById("connection-health-summary");
    const list = document.getElementById("connection-health-list");
    try {
      if (summary) summary.textContent = "Running live health checks…";
      if (list) {
        list.hidden = false;
        list.innerHTML = "";
      }
      const data = await AlphaAPI.api("/api/connections/health");
      const s = data.summary || {};
      if (summary) {
        summary.textContent = `Health: ${s.healthy || 0} healthy · ${s.unhealthy || 0} unhealthy · ${s.total || 0} total`;
      }
      if (list) {
        const rows = data.connections || [];
        if (!rows.length) {
          list.innerHTML = `<li class="activity-item"><div class="activity-body"><p>No connected accounts yet.</p></div></li>`;
        } else {
          list.innerHTML = rows
            .map((c) => {
              const health = c.health || {};
              const ok = health.healthy !== false;
              const label = PLATFORM_LABELS[c.platform] || c.platform;
              const name = escapeHtml(c.accountName || c.accountUsername || c.accountId || "Account");
              const msg = escapeHtml(health.message || (ok ? "OK" : "Needs attention"));
              return `<li class="activity-item"><div class="activity-body"><p><strong>${label}</strong> · ${name}</p><span class="activity-meta">${ok ? "Healthy" : "Unhealthy"} — ${msg}</span></div></li>`;
            })
            .join("");
        }
      }
      showToast("Connection health checks complete");
      await refreshAllData();
    } catch (err) {
      if (summary) summary.textContent = err.message || "Health check failed.";
      showToast(err.message || "Health check failed.", "error");
    }
  });
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("cal-month-label");
  const eventList = document.getElementById("event-list");
  if (!grid || !label) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  label.textContent = calendarViewDate.toLocaleString("en-US", { month: "long", year: "numeric" });

  const events = filteredPosts()
    .filter((p) => p.status !== "cancelled")
    .map((p) => {
      const d = new Date(p.scheduledAt || p.datetime);
      if (d.getFullYear() !== year || d.getMonth() !== month) return null;
      return {
        id: p.id,
        day: d.getDate(),
        title: (p.caption || p.content || "").slice(0, 48),
        platform: p.platform,
        status: p.status,
        time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        raw: p
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day);

  const byDay = {};
  events.forEach((ev) => {
    if (!byDay[ev.day]) byDay[ev.day] = [];
    byDay[ev.day].push(ev);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  grid.innerHTML = "";

  for (let i = 0; i < firstDay; i += 1) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-day";
    if (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    ) {
      cell.classList.add("today");
    }
    if (byDay[day]) cell.classList.add("has-events");
    cell.innerHTML = `<span class="cal-day-num">${day}</span>`;
    if (byDay[day]) {
      const dots = document.createElement("div");
      dots.className = "cal-dots";
      byDay[day].slice(0, 3).forEach((ev) => {
        const dot = document.createElement("span");
        dot.className = `cal-dot platform-${ev.platform}`;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }
    cell.addEventListener("dragover", (e) => {
      e.preventDefault();
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("drag-over");
      const postId = e.dataTransfer.getData("text/plain");
      const post = cachedPosts.find((p) => p.id === postId);
      if (!post) return;
      const original = new Date(post.scheduledAt);
      const updated = new Date(year, month, day, original.getHours(), original.getMinutes());
      reschedulePost(postId, updated);
    });
    cell.addEventListener("click", () => {
      grid.querySelectorAll(".cal-day.selected").forEach((d) => d.classList.remove("selected"));
      cell.classList.add("selected");
      eventList?.querySelectorAll(".event-item").forEach((item) => {
        item.classList.toggle("highlight", item.dataset.day === String(day));
      });
    });
    grid.appendChild(cell);
  }

  if (eventList) {
    eventList.innerHTML = "";
    if (!events.length) {
      eventList.innerHTML = `<li class="event-empty">No posts scheduled this month.</li>`;
    } else {
      events.forEach((ev) => {
        const li = document.createElement("li");
        li.className = "event-item";
        li.dataset.day = String(ev.day);
        if (["draft", "scheduled", "failed"].includes(ev.status)) {
          li.draggable = true;
          li.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", ev.id);
            e.dataTransfer.effectAllowed = "move";
          });
        }
        li.innerHTML = `
          <span class="event-date">${String(ev.day).padStart(2, "0")}</span>
          <div class="event-body">
            <strong>${escapeHtml(ev.title)}</strong>
            <span>${PLATFORM_LABELS[ev.platform] || ev.platform} · ${escapeHtml(ev.time)} · ${statusBadge(ev.status)} ${priorityPill(ev.raw.priority)} ${sourcePill(ev.raw.source)}</span>
            <div class="event-actions">${postActionButtons(ev.raw)}</div>
          </div>`;
        eventList.appendChild(li);
      });
      bindPostActions(eventList);
    }
  }
}

function renderWeekView() {
  const grid = document.getElementById("week-grid");
  const label = document.getElementById("week-label");
  if (!grid || !label) return;

  const start = new Date(weekViewDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  label.textContent = `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  renderHourGrid(grid, days, {
    headerLabel: (d) => d.toLocaleDateString([], { weekday: "short", day: "numeric" })
  });
}

function renderDayView() {
  const grid = document.getElementById("day-grid");
  const label = document.getElementById("day-label");
  if (!grid || !label) return;

  label.textContent = dayViewDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  renderHourGrid(grid, [dayViewDate], {
    headerLabel: (d) => d.toLocaleDateString([], { month: "short", day: "numeric" })
  });
}

function renderHourGrid(grid, days, { headerLabel }) {
  grid.innerHTML = "";
  const corner = document.createElement("div");
  corner.className = "hour-col-header";
  grid.appendChild(corner);
  days.forEach((d) => {
    const header = document.createElement("div");
    header.className = "hour-col-header";
    header.textContent = headerLabel(d);
    grid.appendChild(header);
  });

  const posts = filteredPosts().filter((p) => p.status !== "cancelled");

  for (let hour = 0; hour < 24; hour += 1) {
    const labelCell = document.createElement("div");
    labelCell.className = "hour-label-cell";
    labelCell.textContent = formatHourLabel(hour);
    grid.appendChild(labelCell);

    days.forEach((day) => {
      const slot = document.createElement("div");
      slot.className = "hour-slot";
      const dateKey = localDateKey(day);
      slot.dataset.date = dateKey;
      slot.dataset.hour = String(hour);

      const slotPosts = posts.filter((p) => {
        const d = new Date(p.scheduledAt);
        return localDateKey(d) === dateKey && d.getHours() === hour;
      });
      slotPosts.forEach((p) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `hour-event platform-${p.platform}`;
        chip.title = p.caption || "";
        chip.textContent = `${PLATFORM_LABELS[p.platform] || p.platform} · ${(p.caption || "").slice(0, 32)}`;
        if (["draft", "scheduled", "failed"].includes(p.status)) {
          chip.draggable = true;
          chip.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", p.id);
            e.dataTransfer.effectAllowed = "move";
          });
        }
        chip.addEventListener("click", () => openScheduleModal(p));
        slot.appendChild(chip);
      });

      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("drag-over");
        const postId = e.dataTransfer.getData("text/plain");
        if (!postId) return;
        const [y, m, d] = slot.dataset.date.split("-").map(Number);
        const updated = new Date(y, m - 1, d, Number(slot.dataset.hour), 0);
        reschedulePost(postId, updated);
      });

      grid.appendChild(slot);
    });
  }
}

function priorityPill(priority) {
  const p = priority || "normal";
  return `<span class="priority-pill priority-${escapeHtml(p)}">${escapeHtml(PRIORITY_LABELS[p] || p)}</span>`;
}

function sourcePill(source) {
  if (source !== "ai") return "";
  return `<span class="source-pill">AI</span>`;
}

function postActionButtons(post) {
  const editable = ["draft", "scheduled", "failed"].includes(post.status);
  const cancelable = ["draft", "scheduled", "failed"].includes(post.status);
  const retryable = post.status === "failed";
  const archivable = ["draft", "scheduled", "failed", "cancelled"].includes(post.status);
  const isArchived = post.status === "archived";
  const deletable = post.status !== "processing";
  return [
    editable
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-edit-post="${post.id}">Edit</button>`
      : "",
    cancelable
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-cancel-post="${post.id}">Cancel</button>`
      : "",
    retryable
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-retry-post="${post.id}">Retry</button>`
      : "",
    !isArchived
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-duplicate-post="${post.id}">Duplicate</button>`
      : "",
    !isArchived
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-clone-series-post="${post.id}">Clone series</button>`
      : "",
    archivable
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-archive-post="${post.id}">Archive</button>`
      : "",
    isArchived
      ? `<button type="button" class="btn btn-outline-glow btn-sm" data-restore-post="${post.id}">Restore</button>`
      : "",
    deletable
      ? `<button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-post="${post.id}">Delete</button>`
      : ""
  ].join("");
}

function renderScheduledList() {
  const list = document.getElementById("scheduled-posts-list");
  const empty = document.getElementById("scheduled-empty");
  if (!list) return;

  const posts = filteredPosts().sort(
    (a, b) => new Date(a.scheduledAt || a.datetime) - new Date(b.scheduledAt || b.datetime)
  );
  list.innerHTML = "";
  if (!posts.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  posts.forEach((post) => {
    const li = document.createElement("li");
    li.className = "scheduled-post-item";
    const when = new Date(post.scheduledAt || post.datetime).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const caption = post.caption || post.content || "";
    const err =
      post.status === "failed" && post.errorMessage
        ? `<small class="post-error">${escapeHtml(post.errorMessage)}</small>`
        : "";
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
        ${statusBadge(post.status)} ${priorityPill(post.priority)} ${sourcePill(post.source)}
        <strong>${escapeHtml(caption.slice(0, 90))}${caption.length > 90 ? "…" : ""}</strong>
        <small>${escapeHtml(when)}</small>
        ${err}
      </div>
      <div class="scheduled-post-actions">${postActionButtons(post)}</div>`;
    list.appendChild(li);
  });
  bindPostActions(list);
}

function renderPublishQueue() {
  const list = document.getElementById("publish-queue-list");
  const empty = document.getElementById("queue-empty");
  const counts = document.getElementById("queue-counts");
  if (!list) return;

  let queue = filteredPosts()
    .filter((p) => ["scheduled", "processing", "failed"].includes(p.status))
    .sort((a, b) => new Date(a.scheduledAt || a.datetime) - new Date(b.scheduledAt || b.datetime));

  if (counts) {
    const scheduled = queue.filter((p) => p.status === "scheduled").length;
    const processing = queue.filter((p) => p.status === "processing").length;
    const failed = queue.filter((p) => p.status === "failed").length;
    counts.textContent = `${scheduled} scheduled · ${processing} processing · ${failed} failed`;
  }

  if (queueSubTab === "retry") {
    queue = queue.filter((p) => p.status === "failed" && (p.attemptCount || 0) < (p.maxAttempts || 3));
  }

  list.innerHTML = "";
  if (!queue.length) {
    if (empty) {
      empty.hidden = false;
      empty.textContent =
        queueSubTab === "retry"
          ? "No failed posts waiting to retry."
          : "Queue is empty. Schedule a post to enqueue it.";
    }
    return;
  }
  if (empty) empty.hidden = true;

  queue.forEach((post) => {
    const li = document.createElement("li");
    li.className = "scheduled-post-item";
    const when = new Date(post.scheduledAt || post.datetime).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const caption = post.caption || post.content || "";
    const spacingHint =
      post.status === "failed"
        ? ""
        : `<small class="attempts-remaining">${(post.maxAttempts || 3) - (post.attemptCount || 0)} attempt(s) remaining</small>`;
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
        ${statusBadge(post.status)} ${priorityPill(post.priority)} ${sourcePill(post.source)}
        <strong>${escapeHtml(caption.slice(0, 90))}${caption.length > 90 ? "…" : ""}</strong>
        <small>Due ${escapeHtml(when)} · attempts ${post.attemptCount || 0}/${post.maxAttempts || 3}</small>
        ${spacingHint}
        ${post.errorMessage ? `<small class="post-error">${escapeHtml(post.errorMessage)}</small>` : ""}
      </div>
      <div class="scheduled-post-actions">${postActionButtons(post)}</div>`;
    list.appendChild(li);
  });
  bindPostActions(list);
}

function renderPublishHistory() {
  const list = document.getElementById("publish-history-list");
  const empty = document.getElementById("history-empty");
  const counts = document.getElementById("history-counts");
  if (!list) return;

  const history = filteredPosts()
    .filter((p) => p.status === "published" || p.status === "failed")
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.publishedAt || 0) - new Date(a.updatedAt || a.publishedAt || 0)
    );

  if (counts) {
    const ok = history.filter((p) => p.status === "published").length;
    const bad = history.filter((p) => p.status === "failed").length;
    counts.textContent = `${ok} success · ${bad} failure`;
  }

  list.innerHTML = "";
  if (!history.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  history.forEach((post) => {
    const li = document.createElement("li");
    li.className = "scheduled-post-item";
    const caption = post.caption || post.content || "";
    const detail =
      post.status === "published"
        ? post.externalPostId
          ? `External id: ${post.externalPostId}`
          : "Published successfully"
        : post.errorMessage || "Publish failed";
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
        ${statusBadge(post.status)} ${priorityPill(post.priority)} ${sourcePill(post.source)}
        <strong>${escapeHtml(caption.slice(0, 90))}${caption.length > 90 ? "…" : ""}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
      <div class="scheduled-post-actions">${postActionButtons(post)}</div>`;
    list.appendChild(li);
  });
  bindPostActions(list);
}

function bindPostActions(root) {
  root.querySelectorAll("[data-edit-post]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const post = cachedPosts.find((p) => p.id === btn.getAttribute("data-edit-post"));
      if (post) openScheduleModal(post);
    });
  });
  root.querySelectorAll("[data-delete-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await AlphaAPI.api(`/api/posts/${btn.getAttribute("data-delete-post")}`, { method: "DELETE" });
        showToast("Post deleted", "info");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Delete failed.", "error");
      }
    });
  });
  root.querySelectorAll("[data-cancel-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await AlphaAPI.api(`/api/posts/${btn.getAttribute("data-cancel-post")}/cancel`, {
          method: "POST"
        });
        showToast("Schedule cancelled", "info");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Cancel failed.", "error");
      }
    });
  });
  root.querySelectorAll("[data-retry-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await AlphaAPI.api(`/api/posts/${btn.getAttribute("data-retry-post")}/retry`, {
          method: "POST"
        });
        showToast("Retry queued");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Retry failed.", "error");
      }
    });
  });
  root.querySelectorAll("[data-duplicate-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await AlphaAPI.api(`/api/posts/${btn.getAttribute("data-duplicate-post")}/duplicate`, {
          method: "POST"
        });
        showToast("Duplicated as a new draft");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Duplicate failed.", "error");
      }
    });
  });
  root.querySelectorAll("[data-clone-series-post]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idInput = document.getElementById("clone-series-post-id");
      if (idInput) idInput.value = btn.getAttribute("data-clone-series-post");
      openModal("clone-series-modal");
    });
  });
  root.querySelectorAll("[data-archive-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-archive-post");
      try {
        await AlphaAPI.api(`/api/posts/${id}/archive`, { method: "POST" });
        await refreshAllData();
        showUndoToast("Post archived", async () => {
          try {
            await AlphaAPI.api(`/api/posts/${id}/restore`, { method: "POST" });
            showToast("Post restored");
            await refreshAllData();
          } catch (err) {
            showToast(err.message || "Restore failed.", "error");
          }
        });
      } catch (err) {
        showToast(err.message || "Archive failed.", "error");
      }
    });
  });
  root.querySelectorAll("[data-restore-post]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await AlphaAPI.api(`/api/posts/${btn.getAttribute("data-restore-post")}/restore`, {
          method: "POST"
        });
        showToast("Post restored");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Restore failed.", "error");
      }
    });
  });
}

function initCloneSeriesModal() {
  document.getElementById("clone-series-confirm-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const postId = document.getElementById("clone-series-post-id")?.value;
    const count = Number(document.getElementById("clone-series-count")?.value || 3);
    const intervalValue = Number(document.getElementById("clone-series-interval-value")?.value || 1);
    const intervalUnit = document.getElementById("clone-series-interval-unit")?.value || "day";
    if (!postId) return;
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api(`/api/posts/${postId}/clone-series`, {
        method: "POST",
        body: { count, intervalValue, intervalUnit }
      });
      showToast(`Created a ${data.posts?.length || count}-post series`);
      closeModal("clone-series-modal");
      await refreshAllData();
    } catch (err) {
      showToast(err.message || "Clone series failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

let modalMediaAssets = [];
let modalContentBoxResult = null;
let modalContentBoxActiveKey = "caption";
let modalScoreTimer = null;
let modalPreviewPlatform = "";

function renderPlatformCheckboxes(selected = [], { locked = false } = {}) {
  const grid = document.getElementById("post-platforms-grid");
  if (!grid) return;
  grid.innerHTML = "";
  SCHEDULER_PLATFORMS.forEach((p) => {
    const checked = selected.includes(p);
    const label = document.createElement("label");
    label.className = "platform-checkbox";
    label.innerHTML = `<input type="checkbox" value="${p}" ${checked ? "checked" : ""} ${locked ? "disabled" : ""}> ${escapeHtml(PLATFORM_LABELS[p] || p)}`;
    label.querySelector("input").addEventListener("change", onPlatformSelectionChanged);
    grid.appendChild(label);
  });
  const lockedHint = document.getElementById("post-platforms-locked-hint");
  if (lockedHint) lockedHint.hidden = !locked;
}

function getSelectedPlatforms() {
  return Array.from(document.querySelectorAll("#post-platforms-grid input:checked")).map((i) => i.value);
}

function onPlatformSelectionChanged() {
  hideError("platform-error");
  updateMediaFieldHint();
  renderPlatformPreviewTabs();
  scheduleWarningsAndScoreRefresh();
}

function updateMediaFieldHint() {
  const platforms = getSelectedPlatforms();
  const hint = document.getElementById("post-media-hint");
  if (hint) {
    hint.textContent = platforms.includes("instagram")
      ? "Instagram requires at least one public image to publish — upload or generate one below."
      : "Optional. Instagram publishing requires at least one image.";
  }
}

function validMediaForApi() {
  // Legacy posts created before the media library existed may carry a bare
  // mediaUrl with no real MediaAsset id — the API's structured `media` field
  // requires a real assetId, so those fall back to the top-level mediaUrl
  // field instead of being sent here.
  return modalMediaAssets.filter((m) => m.assetId);
}

function assetToMediaItem(asset) {
  return {
    assetId: asset.id,
    url: asset.url,
    type: asset.type,
    width: asset.width || null,
    height: asset.height || null,
    durationSec: asset.durationSec || null,
    source: asset.source
  };
}

function renderMediaThumbs() {
  const row = document.getElementById("media-thumb-row");
  const mediaUrlInput = document.getElementById("post-media-url");
  if (!row) return;
  row.innerHTML = "";
  modalMediaAssets.forEach((asset, idx) => {
    const thumb = document.createElement("div");
    thumb.className = "media-thumb";
    thumb.innerHTML =
      asset.type === "video"
        ? `<video src="${escapeHtml(asset.url)}" muted></video>`
        : `<img src="${escapeHtml(asset.url)}" alt="">`;
    if (asset.source === "ai-generated") {
      const badge = document.createElement("span");
      badge.className = "media-thumb-badge";
      badge.textContent = "AI";
      thumb.appendChild(badge);
    }
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "media-thumb-remove";
    removeBtn.setAttribute("aria-label", "Remove media");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      modalMediaAssets.splice(idx, 1);
      renderMediaThumbs();
      scheduleWarningsAndScoreRefresh();
    });
    thumb.appendChild(removeBtn);
    row.appendChild(thumb);
  });
  if (mediaUrlInput) mediaUrlInput.value = modalMediaAssets[0]?.url || "";
  hideError("media-error");
  renderPlatformPreviewFrame();
}

async function uploadMediaFiles(formData) {
  const url = window.PA_CONFIG?.api?.("/api/media/upload") || "/api/media/upload";
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    body: formData
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, error: text || "Invalid server response." };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function initMediaManager() {
  const fileInput = document.getElementById("media-file-input");
  fileInput?.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    try {
      const data = await uploadMediaFiles(formData);
      (data.assets || []).forEach((a) => modalMediaAssets.push(assetToMediaItem(a)));
      renderMediaThumbs();
      scheduleWarningsAndScoreRefresh();
      showToast("Media uploaded");
    } catch (err) {
      showToast(err.message || "Upload failed.", "error");
    } finally {
      fileInput.value = "";
    }
  });

  const genRow = document.getElementById("media-generate-prompt-row");
  document.getElementById("media-generate-btn")?.addEventListener("click", () => {
    if (genRow) genRow.hidden = !genRow.hidden;
  });

  document.getElementById("media-generate-confirm")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const promptInput = document.getElementById("media-generate-prompt");
    const prompt = (promptInput?.value || "").trim();
    if (prompt.length < 3) {
      showToast("Describe the image you want first.", "error");
      return;
    }
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api("/api/media/generate-image", { method: "POST", body: { prompt } });
      modalMediaAssets.push(assetToMediaItem(data.asset));
      renderMediaThumbs();
      scheduleWarningsAndScoreRefresh();
      if (promptInput) promptInput.value = "";
      if (genRow) genRow.hidden = true;
      showToast("Image generated");
    } catch (err) {
      showToast(err.message || "AI image generation failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("media-generate-video-btn")?.addEventListener("click", () => {
    showToast("AI video generation is coming in a future sprint — upload a video instead.", "info");
  });
}

function renderPlatformPreviewTabs() {
  const tabs = document.getElementById("platform-preview-tabs");
  if (!tabs) return;
  const selected = getSelectedPlatforms();
  tabs.innerHTML = "";
  if (!selected.length) {
    modalPreviewPlatform = "";
    renderPlatformPreviewFrame();
    return;
  }
  if (!selected.includes(modalPreviewPlatform)) modalPreviewPlatform = selected[0];
  selected.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `platform-preview-tab-btn${p === modalPreviewPlatform ? " active" : ""}`;
    btn.textContent = PLATFORM_LABELS[p] || p;
    btn.addEventListener("click", () => {
      modalPreviewPlatform = p;
      renderPlatformPreviewTabs();
    });
    tabs.appendChild(btn);
  });
  renderPlatformPreviewFrame();
}

function renderPlatformPreviewFrame() {
  const frame = document.getElementById("platform-preview-frame");
  if (!frame) return;
  const caption = document.getElementById("post-content")?.value || "";
  if (!modalPreviewPlatform) {
    frame.innerHTML = `<p class="empty-state">Select a platform to preview your post.</p>`;
    return;
  }
  const media = modalMediaAssets[0];
  const mediaHtml = media
    ? media.type === "video"
      ? `<video class="preview-post-media" src="${escapeHtml(media.url)}" controls></video>`
      : `<img class="preview-post-media" src="${escapeHtml(media.url)}" alt="">`
    : "";
  const displayName = currentUser?.name || currentUser?.email || "Your account";
  frame.innerHTML = `
    <div class="preview-post-header">
      <span class="preview-post-avatar">${escapeHtml(displayName.slice(0, 2).toUpperCase())}</span>
      <div>
        <strong>${escapeHtml(displayName)}</strong>
        <div><span class="platform-pill platform-${escapeHtml(modalPreviewPlatform)}">${escapeHtml(PLATFORM_LABELS[modalPreviewPlatform] || modalPreviewPlatform)}</span></div>
      </div>
    </div>
    ${mediaHtml}
    <p class="preview-post-caption">${caption ? escapeHtml(caption) : "<em>Your caption will appear here…</em>"}</p>`;
}

function scheduleWarningsAndScoreRefresh() {
  clearTimeout(modalScoreTimer);
  modalScoreTimer = setTimeout(() => {
    refreshAiScore();
    refreshSmartWarnings();
  }, 450);
}

async function refreshAiScore() {
  const panel = document.getElementById("ai-score-meters");
  const explanationEl = document.getElementById("ai-score-explanation");
  if (!panel) return;
  const platforms = getSelectedPlatforms();
  const caption = (document.getElementById("post-content")?.value || "").trim();
  const datetime = document.getElementById("post-datetime")?.value;
  if (!platforms.length || caption.length < 10 || !datetime) {
    panel.innerHTML = `<p class="empty-state">Score updates as you fill in the caption, media, and time.</p>`;
    if (explanationEl) explanationEl.innerHTML = "";
    return;
  }
  try {
    const data = await AlphaAPI.api("/api/posts/score", {
      method: "POST",
      body: {
        platform: platforms[0],
        caption,
        scheduledAt: localInputToIso(datetime),
        media: validMediaForApi()
      }
    });
    renderAiScore(data.score);
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">${escapeHtml(err.message || "Could not calculate score.")}</p>`;
  }
}

function renderAiScore(score) {
  const panel = document.getElementById("ai-score-meters");
  const explanationEl = document.getElementById("ai-score-explanation");
  if (!panel || !score) return;
  const meters = [
    { label: "Reach", value: score.reachScore },
    { label: "Engagement", value: score.engagementScore },
    { label: "Virality", value: score.viralityScore }
  ];
  panel.innerHTML = meters
    .map(
      (m) => `
    <div class="ai-score-meter-row">
      <span class="ai-score-meter-label">${escapeHtml(m.label)}</span>
      <div class="ai-score-meter-track"><div class="ai-score-meter-fill" style="width:${m.value}%"></div></div>
      <span class="ai-score-meter-value">${m.value}</span>
    </div>`
    )
    .join("");
  if (explanationEl) {
    explanationEl.innerHTML = (score.explanation || []).map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  }
}

async function refreshSmartWarnings() {
  const banner = document.getElementById("schedule-warnings-banner");
  if (!banner) return;
  const platforms = getSelectedPlatforms();
  const caption = (document.getElementById("post-content")?.value || "").trim();
  const datetime = document.getElementById("post-datetime")?.value;
  if (!platforms.length || caption.length < 10 || !datetime) {
    banner.hidden = true;
    return;
  }
  try {
    const excludePostId = document.getElementById("post-id")?.value || "";
    const data = await AlphaAPI.api("/api/posts/validate", {
      method: "POST",
      body: {
        platforms,
        caption,
        scheduledAt: localInputToIso(datetime),
        media: validMediaForApi(),
        ...(excludePostId ? { excludePostId } : {})
      }
    });
    const items = [...(data.blockers || []), ...(data.warnings || [])];
    if (!items.length) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.classList.toggle("blocker", (data.blockers || []).length > 0);
    banner.innerHTML = `<strong>Smart warnings</strong><ul>${items
      .map((w) => `<li>${escapeHtml(w.message || String(w))}</li>`)
      .join("")}</ul>`;
  } catch {
    banner.hidden = true;
  }
}

const CONTENT_BOX_TABS = [
  { key: "caption", label: "Original" },
  { key: "emojiVersion", label: "Emoji" },
  { key: "professionalVersion", label: "Professional" },
  { key: "casualVersion", label: "Casual" }
];

function renderContentBoxResult() {
  const result = document.getElementById("ai-box-result");
  const tabsEl = document.getElementById("ai-variant-tabs");
  const textEl = document.getElementById("ai-variant-text");
  const hashtagsEl = document.getElementById("ai-variant-hashtags");
  if (!result || !modalContentBoxResult) return;
  result.hidden = false;
  if (tabsEl) {
    tabsEl.innerHTML = "";
    CONTENT_BOX_TABS.forEach((tab) => {
      if (!modalContentBoxResult[tab.key]) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ai-variant-tab-btn${tab.key === modalContentBoxActiveKey ? " active" : ""}`;
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        modalContentBoxActiveKey = tab.key;
        renderContentBoxResult();
      });
      tabsEl.appendChild(btn);
    });
  }
  if (textEl) textEl.textContent = modalContentBoxResult[modalContentBoxActiveKey] || modalContentBoxResult.caption || "";
  if (hashtagsEl) hashtagsEl.textContent = modalContentBoxResult.hashtags || "";
}

function initAiContentBox() {
  document.getElementById("ai-box-generate")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const promptInput = document.getElementById("ai-box-prompt");
    const prompt = (promptInput?.value || "").trim();
    const platforms = getSelectedPlatforms();
    if (prompt.length < 3) {
      showToast("Enter a short prompt first.", "error");
      return;
    }
    if (!platforms.length) {
      showToast("Select at least one platform first.", "error");
      return;
    }
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api("/api/scheduler/ai/content-box", {
        method: "POST",
        body: { platform: platforms[0], prompt }
      });
      modalContentBoxResult = data;
      modalContentBoxActiveKey = "caption";
      renderContentBoxResult();
    } catch (err) {
      showToast(err.message || "AI content generation failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("ai-box-insert")?.addEventListener("click", () => {
    if (!modalContentBoxResult) return;
    const content = document.getElementById("post-content");
    const count = document.getElementById("content-count");
    const text = modalContentBoxResult[modalContentBoxActiveKey] || modalContentBoxResult.caption || "";
    const hashtags = modalContentBoxResult.hashtags || "";
    if (content) {
      content.value = hashtags ? `${text}\n\n${hashtags}` : text;
      if (count) count.textContent = String(content.value.length);
    }
    const sourceInput = document.getElementById("post-source");
    if (sourceInput) sourceInput.value = "ai";
    renderPlatformPreviewFrame();
    scheduleWarningsAndScoreRefresh();
    showToast("Inserted into caption");
  });
}

function initSmartTimeButton() {
  document.getElementById("smart-time-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const platforms = getSelectedPlatforms();
    if (!platforms.length) {
      showToast("Select at least one platform first.", "error");
      return;
    }
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api(
        `/api/posts/smart-time?platform=${encodeURIComponent(platforms[0])}`
      );
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), data.bestHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const datetime = document.getElementById("post-datetime");
      if (datetime) datetime.value = toLocalInput(target);
      const hint = document.getElementById("smart-time-hint");
      if (hint) hint.textContent = `Suggested ${data.bestHourLabel || data.bestHour + ":00"} — ${data.basis || "heuristic"}`;
      scheduleWarningsAndScoreRefresh();
    } catch (err) {
      showToast(err.message || "Could not fetch smart time.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

function openScheduleModal(post = null) {
  const form = document.getElementById("schedule-form");
  const title = document.getElementById("schedule-modal-title");
  const idInput = document.getElementById("post-id");
  const groupIdInput = document.getElementById("post-group-id");
  const sourceInput = document.getElementById("post-source");
  const content = document.getElementById("post-content");
  const datetime = document.getElementById("post-datetime");
  const priority = document.getElementById("post-priority");
  const count = document.getElementById("content-count");
  const success = document.getElementById("schedule-success");
  const warningsBanner = document.getElementById("schedule-warnings-banner");
  const smartTimeHint = document.getElementById("smart-time-hint");
  if (success) success.hidden = true;
  if (warningsBanner) warningsBanner.hidden = true;
  if (smartTimeHint) smartTimeHint.textContent = "";
  ["content-error", "platform-error", "datetime-error", "media-error"].forEach(hideError);

  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  if (datetime) datetime.min = minDate.toISOString().slice(0, 16);

  modalContentBoxResult = null;
  const boxResult = document.getElementById("ai-box-result");
  if (boxResult) boxResult.hidden = true;
  const boxPrompt = document.getElementById("ai-box-prompt");
  if (boxPrompt) boxPrompt.value = "";

  if (post) {
    if (title) title.textContent = "Edit scheduled post";
    if (idInput) idInput.value = post.id;
    if (groupIdInput) groupIdInput.value = post.groupId || "";
    if (sourceInput) sourceInput.value = post.source || "manual";
    if (content) content.value = post.caption || post.content || "";
    if (datetime) datetime.value = post.datetime || toLocalInput(post.scheduledAt);
    if (priority) priority.value = post.priority || "normal";
    modalMediaAssets = Array.isArray(post.media) && post.media.length
      ? post.media.map((m) => ({ ...m }))
      : post.mediaUrl
        ? [{ assetId: "", url: post.mediaUrl, type: "image", width: null, height: null, durationSec: null }]
        : [];
    modalPreviewPlatform = "";
    renderPlatformCheckboxes([post.platform], { locked: true });
  } else {
    if (title) title.textContent = "Create scheduled post";
    form?.reset();
    if (idInput) idInput.value = "";
    if (groupIdInput) groupIdInput.value = "";
    if (sourceInput) sourceInput.value = "manual";
    if (priority) priority.value = "normal";
    modalMediaAssets = [];
    modalPreviewPlatform = "";
    renderPlatformCheckboxes([]);
  }
  if (count) count.textContent = String((content?.value || "").length);
  updateMediaFieldHint();
  renderMediaThumbs();
  renderPlatformPreviewTabs();
  refreshAiScore();
  refreshSmartWarnings();
  openModal("schedule-modal");
}

function toLocalInput(value) {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  const d = new Date(value);
  return d.toISOString();
}

function initScheduleForm() {
  const form = document.getElementById("schedule-form");
  if (!form) return;
  const content = document.getElementById("post-content");
  const datetime = document.getElementById("post-datetime");
  const mediaUrl = document.getElementById("post-media-url");
  const count = document.getElementById("content-count");
  const submit = document.getElementById("schedule-submit");
  const draftBtn = document.getElementById("schedule-save-draft");
  const success = document.getElementById("schedule-success");
  const idInput = document.getElementById("post-id");
  const priority = document.getElementById("post-priority");
  const sourceInput = document.getElementById("post-source");

  initMediaManager();
  initAiContentBox();
  initSmartTimeButton();
  document.getElementById("ai-score-refresh")?.addEventListener("click", () => refreshAiScore());

  content?.addEventListener("input", () => {
    if (count) count.textContent = String(content.value.length);
    hideError("content-error");
    content.classList.remove("invalid");
    renderPlatformPreviewFrame();
    scheduleWarningsAndScoreRefresh();
  });

  datetime?.addEventListener("change", () => {
    hideError("datetime-error");
    datetime.classList.remove("invalid");
    scheduleWarningsAndScoreRefresh();
  });

  const isPublicHttpUrl = (value) => {
    try {
      const u = new URL(String(value || ""));
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const validateBase = ({ requireFutureTime, status, platforms }) => {
    ["content-error", "platform-error", "datetime-error", "media-error"].forEach(hideError);
    [content, datetime, mediaUrl].forEach((el) => el?.classList.remove("invalid"));
    let valid = true;
    const contentVal = (content?.value || "").trim();
    if (contentVal.length < 10) {
      showError("content-error");
      content?.classList.add("invalid");
      valid = false;
    }
    if (!platforms.length) {
      showError("platform-error");
      valid = false;
    }
    if (requireFutureTime) {
      if (!datetime?.value || new Date(datetime.value) <= new Date()) {
        showError("datetime-error");
        datetime?.classList.add("invalid");
        valid = false;
      }
    }
    if (status === "scheduled" && platforms.includes("instagram") && !isPublicHttpUrl(mediaUrl?.value)) {
      showError("media-error");
      valid = false;
    }
    return valid;
  };

  const savePost = async ({ status, button }) => {
    if (success) success.hidden = true;
    const platforms = getSelectedPlatforms();
    const requireFutureTime = status === "scheduled";
    if (!validateBase({ requireFutureTime, status, platforms })) {
      showToast("Please fix the highlighted fields.", "error");
      return;
    }

    const payload = {
      caption: (content?.value || "").trim(),
      status,
      priority: priority?.value || "normal",
      source: sourceInput?.value || "manual",
      media: validMediaForApi()
    };
    if (platforms.length > 1) payload.platforms = platforms;
    else payload.platform = platforms[0];
    if ((mediaUrl?.value || "").trim()) payload.mediaUrl = mediaUrl.value.trim();
    if (datetime?.value) payload.scheduledAt = localInputToIso(datetime.value);

    setButtonLoading(button, true);
    try {
      const editingId = idInput?.value || "";
      if (editingId) {
        await AlphaAPI.api(`/api/posts/${editingId}`, { method: "PUT", body: payload });
        showToast(status === "draft" ? "Draft updated" : "Scheduled post updated");
      } else {
        const data = await AlphaAPI.api("/api/posts", { method: "POST", body: payload });
        if ((data.warnings || []).length) {
          showToast(`Saved with ${data.warnings.length} smart warning(s) — open the post to review.`, "info");
        } else {
          showToast(
            status === "draft"
              ? "Draft saved"
              : platforms.length > 1
                ? `Scheduled for ${platforms.length} platforms`
                : `Scheduled for ${PLATFORM_LABELS[platforms[0]] || platforms[0]}`
          );
        }
      }
      if (success) success.hidden = false;
      await refreshAllData();
      setTimeout(() => {
        closeModal("schedule-modal");
        form.reset();
        if (idInput) idInput.value = "";
        if (count) count.textContent = "0";
        if (success) success.hidden = true;
        modalMediaAssets = [];
        renderMediaThumbs();
      }, 500);
    } catch (err) {
      if (err.status === 409) {
        showToast(`${err.message} Adjust the time to resolve the conflict.`, "error");
      } else {
        showToast(err.message || "Could not save post.", "error");
      }
    } finally {
      setButtonLoading(button, false);
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await savePost({ status: "scheduled", button: submit });
  });

  draftBtn?.addEventListener("click", async () => {
    await savePost({ status: "draft", button: draftBtn });
  });
}

/* ---------- Connections / multi-provider OAuth ---------- */

function providerAuthLabel(platform) {
  if (platform === "instagram" || platform === "facebook") return "Continue to Meta";
  if (platform === "youtube") return "Continue to Google";
  if (platform === "linkedin") return "Continue to LinkedIn";
  if (platform === "x") return "Continue to X";
  return "Continue to provider";
}

function startOAuthFlow(platform, { mode = "connect", connectionId = null, accountId = null } = {}) {
  const icon = document.getElementById("oauth-icon");
  const title = document.getElementById("oauth-title");
  const subtitle = document.getElementById("oauth-subtitle");
  const statusEl = document.getElementById("oauth-status");
  const confirmBtn = document.getElementById("oauth-confirm-btn");
  const label = confirmBtn?.querySelector(".btn-label");

  if (icon) icon.src = `../img/${platform === "x" ? "x" : platform}.svg`;
  if (title) {
    title.textContent = `${mode === "reconnect" ? "Reconnect" : "Connect"} ${PLATFORM_LABELS[platform]}`;
  }
  if (subtitle) {
    subtitle.textContent = `Secure OAuth for ${PLATFORM_LABELS[platform]}. Tokens are encrypted in PostgreSQL.`;
  }
  if (statusEl) statusEl.textContent = "";
  if (label) label.textContent = providerAuthLabel(platform);
  openModal("oauth-modal");

  if (!confirmBtn) return;
  confirmBtn.onclick = async () => {
    setButtonLoading(confirmBtn, true);
    if (statusEl) statusEl.textContent = "Creating secure OAuth session…";
    try {
      const data = await AlphaAPI.api(`/api/oauth/${platform}/start`, {
        method: "POST",
        body: { mode, connectionId, accountId }
      });
      window.location.href = data.url;
    } catch (err) {
      setButtonLoading(confirmBtn, false);
      if (statusEl) statusEl.textContent = err.message;
      showToast(err.message || "Could not start OAuth.", "error");
    }
  };
}

/**
 * Opens the shared disconnect confirmation modal and wires its confirm
 * button to run `onConfirm`. Prevents accidental one-click disconnects.
 */
function confirmDisconnect({ label, onConfirm }) {
  const bodyEl = document.getElementById("disconnect-confirm-body");
  const confirmBtn = document.getElementById("disconnect-confirm-btn");
  if (bodyEl) {
    bodyEl.textContent = `This will remove the stored connection for ${label}. You can reconnect at any time.`;
  }
  openModal("disconnect-confirm-modal");
  if (!confirmBtn) return;
  confirmBtn.onclick = async () => {
    setButtonLoading(confirmBtn, true);
    try {
      await onConfirm();
      closeModal("disconnect-confirm-modal");
    } catch (err) {
      showToast(err.message || "Disconnect failed.", "error");
    } finally {
      setButtonLoading(confirmBtn, false);
    }
  };
}

function initConnectPages() {
  document.querySelectorAll(".connect-card").forEach((card) => {
    const btn = card.querySelector(".connect-btn");
    const reconnectBtn = card.querySelector(".reconnect-btn");

    btn?.addEventListener("click", async () => {
      const platform = card.dataset.platform;
      const state = cachedConnections[platform] || {};

      if (state.connected && !state.reconnectRequired) {
        confirmDisconnect({
          label: PLATFORM_LABELS[platform] || platform,
          onConfirm: async () => {
            await AlphaAPI.api(`/api/connections/${platform}`, { method: "DELETE" });
            showToast(`${PLATFORM_LABELS[platform]} disconnected`, "info");
            await refreshAllData();
          }
        });
        return;
      }

      startOAuthFlow(platform, { mode: "connect" });
    });

    reconnectBtn?.addEventListener("click", async () => {
      const platform = card.dataset.platform;
      const state = cachedConnections[platform] || {};
      if (state.id) {
        try {
          await AlphaAPI.api(`/api/connections/${state.id}/reconnect`, { method: "POST" });
        } catch {
          /* start flow anyway */
        }
      }
      startOAuthFlow(platform, {
        mode: "reconnect",
        connectionId: state.id || null,
        accountId: state.accountId || null
      });
    });
  });
}

function renderConnections() {
  document.querySelectorAll(".connect-card").forEach((card) => {
    const platform = card.dataset.platform;
    const state = cachedConnections[platform] || {
      connected: false,
      supported: true,
      configured: false
    };
    const status = card.querySelector("[data-status]");
    const account = card.querySelector("[data-account]");
    const configEl = card.querySelector("[data-config]");
    const btn = card.querySelector(".connect-btn");
    const reconnectBtn = card.querySelector(".reconnect-btn");

    const comingSoon = COMING_SOON_PLATFORMS.has(platform);

    card.classList.toggle("connected", Boolean(state.connected));
    card.classList.toggle("needs-reconnect", Boolean(state.reconnectRequired));
    card.classList.toggle("expired", state.status === "expired");

    if (status) {
      if (comingSoon) status.textContent = "Coming soon";
      else if (state.status === "expired") status.textContent = "Expired";
      else if (state.reconnectRequired) status.textContent = "Needs reconnect";
      else if (state.connected) {
        status.textContent =
          state.accountCount > 1 ? `Connected (${state.accountCount})` : "Connected";
      } else if (!state.configured) status.textContent = "Credentials not configured";
      else status.textContent = "Not connected";
      status.classList.toggle("connected", Boolean(state.connected) && !state.reconnectRequired);
      status.classList.toggle("expired", Boolean(state.reconnectRequired) && !comingSoon);
    }

    if (account) {
      const label = state.accountUsername || state.accountName || "";
      account.hidden = !state.connected;
      account.textContent = label;
    }

    if (configEl) {
      configEl.hidden = comingSoon || state.configured !== false || state.connected;
      configEl.textContent = state.configured
        ? ""
        : "Add provider env vars on the server to enable live OAuth.";
    }

    if (btn) {
      if (comingSoon) {
        btn.disabled = true;
        btn.textContent = "Coming soon";
        btn.classList.remove("btn-glow");
        btn.classList.add("btn-outline-glow");
      } else if (state.connected && !state.reconnectRequired) {
        btn.disabled = false;
        btn.textContent = "Disconnect";
        btn.classList.add("btn-glow");
        btn.classList.remove("btn-outline-glow");
      } else {
        btn.disabled = false;
        btn.textContent = state.configured ? "Connect" : "Connect (needs keys)";
        btn.classList.remove("btn-glow");
        btn.classList.add("btn-outline-glow");
      }
    }

    if (reconnectBtn) {
      reconnectBtn.hidden = comingSoon || !state.reconnectRequired;
    }
  });

  renderConnectedAccountsList();
}

function renderConnectedAccountsList() {
  const list = document.getElementById("connected-accounts-list");
  const empty = document.getElementById("connected-accounts-empty");
  if (!list) return;

  const accounts = Object.values(cachedConnections)
    .flatMap((p) => p.accounts || [])
    .sort((a, b) => a.platform.localeCompare(b.platform));

  list.innerHTML = "";
  if (!accounts.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  accounts.forEach((acc) => {
    const li = document.createElement("li");
    li.className = "scheduled-post-item";
    const expiry = acc.tokenExpiresAt
      ? `Expires ${new Date(acc.tokenExpiresAt).toLocaleString()}`
      : "No expiry on record";
    const displayName = acc.accountName || acc.accountId || "Account";
    const initials = displayName.slice(0, 2).toUpperCase();
    const avatar = acc.avatarUrl
      ? `<img class="account-avatar" src="${escapeHtml(acc.avatarUrl)}" alt="" loading="lazy">`
      : `<span class="account-avatar account-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>`;
    const badgeStatus = acc.status === "expired" ? "expired" : acc.status || "active";
    li.innerHTML = `
      <div class="scheduled-post-main">
        ${avatar}
        <span class="platform-pill platform-${escapeHtml(acc.platform)}">${escapeHtml(PLATFORM_LABELS[acc.platform] || acc.platform)}</span>
        <span class="status-badge status-${escapeHtml(badgeStatus)}">${escapeHtml(badgeStatus === "expired" ? "Expired" : badgeStatus)}</span>
        <strong>${escapeHtml(displayName)}</strong>
        <small>${escapeHtml(acc.accountUsername || "")} · ${escapeHtml(expiry)}</small>
      </div>
      <div class="scheduled-post-actions">
        ${
          acc.reconnectRequired
            ? `<button type="button" class="btn btn-outline-glow btn-sm" data-reconnect-id="${acc.id}" data-platform="${acc.platform}" data-account-id="${acc.accountId}">Reconnect</button>`
            : `<button type="button" class="btn btn-outline-glow btn-sm" data-refresh-id="${acc.id}">Refresh token</button>
               <button type="button" class="btn btn-outline-glow btn-sm" data-validate-id="${acc.id}">Validate</button>`
        }
        <button type="button" class="btn btn-outline-glow btn-sm danger" data-disconnect-id="${acc.id}" data-account-label="${escapeHtml(`${PLATFORM_LABELS[acc.platform] || acc.platform} · ${displayName}`)}">Disconnect</button>
      </div>`;
    list.appendChild(li);
  });

  list.querySelectorAll("[data-disconnect-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-disconnect-id");
      confirmDisconnect({
        label: btn.getAttribute("data-account-label") || "this account",
        onConfirm: async () => {
          await AlphaAPI.api(`/api/connections/account/${id}`, { method: "DELETE" });
          showToast("Account disconnected", "info");
          await refreshAllData();
        }
      });
    });
  });

  list.querySelectorAll("[data-refresh-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await AlphaAPI.api(`/api/connections/${btn.getAttribute("data-refresh-id")}/refresh`, {
          method: "POST"
        });
        showToast("Token refreshed");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Refresh failed.", "error");
      }
    });
  });

  list.querySelectorAll("[data-validate-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await AlphaAPI.api(`/api/connections/${btn.getAttribute("data-validate-id")}/validate`, {
          method: "POST"
        });
        showToast("Connection validated with Meta Graph API");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Validation failed. Reconnect required.", "error");
        await refreshAllData();
      }
    });
  });

  list.querySelectorAll("[data-reconnect-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-reconnect-id");
      const platform = btn.getAttribute("data-platform");
      try {
        await AlphaAPI.api(`/api/connections/${id}/reconnect`, { method: "POST" });
      } catch {
        /* continue */
      }
      startOAuthFlow(platform, { mode: "reconnect", connectionId: id, accountId: btn.getAttribute("data-account-id") });
    });
  });
}

function initOAuthQueryFeedback() {
  const params = new URLSearchParams(window.location.search);
  const oauth = params.get("oauth");
  if (!oauth) return;
  if (oauth === "success") {
    showToast(`${PLATFORM_LABELS[params.get("platform")] || "Account"} connected`);
    navigateToSection("connect");
  } else if (oauth === "error") {
    showToast(params.get("message") || "OAuth failed.", "error");
    navigateToSection("connect");
  }
  params.delete("oauth");
  params.delete("platform");
  params.delete("message");
  const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  history.replaceState(null, "", clean);
}

/* ---------- OpenAI generator (Sprint 3) ---------- */

function initAITools() {
  const form = document.getElementById("ai-generator-form");
  if (!form) return;

  const platform = document.getElementById("ai-platform");
  const goal = document.getElementById("ai-goal");
  const tone = document.getElementById("ai-tone");
  const topic = document.getElementById("ai-topic");
  const audience = document.getElementById("ai-audience");
  const language = document.getElementById("ai-language");
  const generateBtn = document.getElementById("ai-generate-btn");
  const outputPanel = document.getElementById("ai-output-panel");
  const captionOut = document.getElementById("ai-caption-output");
  const hashtagOut = document.getElementById("ai-hashtag-output");
  const hookOut = document.getElementById("ai-hook-output");
  const ctaOut = document.getElementById("ai-cta-output");
  const copyCaptionBtn = document.getElementById("ai-copy-caption-btn");
  const copyHashtagsBtn = document.getElementById("ai-copy-hashtags-btn");
  const saveDraftBtn = document.getElementById("ai-save-draft-btn");
  const draftSuccess = document.getElementById("ai-draft-success");
  const successEl = document.getElementById("ai-success");
  const formError = document.getElementById("ai-form-error");

  const setFormError = (message) => {
    if (!formError) return;
    if (!message) {
      formError.hidden = true;
      formError.textContent = "";
      return;
    }
    formError.hidden = false;
    formError.textContent = message;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ["ai-platform-error", "ai-goal-error", "ai-tone-error", "ai-topic-error"].forEach(hideError);
    setFormError("");
    if (successEl) successEl.hidden = true;
    if (draftSuccess) draftSuccess.hidden = true;

    let valid = true;
    if (!platform.value) {
      showError("ai-platform-error");
      valid = false;
    }
    if (!goal.value) {
      showError("ai-goal-error");
      valid = false;
    }
    if (!tone.value) {
      showError("ai-tone-error");
      valid = false;
    }
    if ((topic.value || "").trim().length < 3) {
      showError("ai-topic-error");
      valid = false;
    }
    if (!valid) {
      setFormError("Please complete all required fields.");
      showToast("Please complete all generator fields.", "error");
      return;
    }

    setButtonLoading(generateBtn, true);
    if (outputPanel) outputPanel.hidden = false;
    if (captionOut) captionOut.textContent = "Generating…";
    if (hashtagOut) hashtagOut.textContent = "…";
    if (hookOut) hookOut.textContent = "…";
    if (ctaOut) ctaOut.textContent = "…";

    try {
      const data = await AlphaAPI.api("/api/ai/generate-content", {
        method: "POST",
        body: {
          platform: platform.value,
          contentGoal: goal.value,
          tone: tone.value,
          topic: topic.value.trim(),
          audience: (audience?.value || "").trim(),
          language: (language?.value || "en").trim() || "en"
        }
      });

      lastAiResult = {
        platform: data.platform,
        contentGoal: goal.value,
        tone: tone.value,
        topic: topic.value.trim(),
        audience: (audience?.value || "").trim(),
        language: (language?.value || "en").trim() || "en",
        caption: data.caption,
        hashtags: data.hashtags,
        shortHook: data.shortHook,
        callToAction: data.callToAction,
        generatedAt: data.generatedAt
      };

      if (captionOut) captionOut.textContent = data.caption;
      if (hashtagOut) hashtagOut.textContent = data.hashtags;
      if (hookOut) hookOut.textContent = data.shortHook;
      if (ctaOut) ctaOut.textContent = data.callToAction;
      if (successEl) successEl.hidden = false;
      showToast("Content generated");
    } catch (err) {
      lastAiResult = null;
      if (captionOut) captionOut.textContent = "";
      if (hashtagOut) hashtagOut.textContent = "";
      if (hookOut) hookOut.textContent = "";
      if (ctaOut) ctaOut.textContent = "";
      setFormError(err.message || "Generation failed.");
      showToast(err.message || "Generation failed.", "error");
    } finally {
      setButtonLoading(generateBtn, false);
    }
  });

  const copyText = async (value, label) => {
    if (!value) {
      showToast("Generate content first.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Could not copy — select text manually.", "error");
    }
  };

  copyCaptionBtn?.addEventListener("click", () => copyText(lastAiResult?.caption, "Caption"));
  copyHashtagsBtn?.addEventListener("click", () => copyText(lastAiResult?.hashtags, "Hashtags"));

  saveDraftBtn?.addEventListener("click", async () => {
    if (!lastAiResult) {
      showToast("Generate content first.", "error");
      return;
    }
    setButtonLoading(saveDraftBtn, true);
    try {
      await AlphaAPI.api("/api/ai/drafts", { method: "POST", body: lastAiResult });
      if (draftSuccess) draftSuccess.hidden = false;
      showToast("Draft saved");
      await renderDrafts();
      setTimeout(() => {
        if (draftSuccess) draftSuccess.hidden = true;
      }, 2500);
    } catch (err) {
      showToast(err.message || "Could not save draft.", "error");
    } finally {
      setButtonLoading(saveDraftBtn, false);
    }
  });

  renderDrafts();
}

async function renderDrafts() {
  const list = document.getElementById("drafts-list");
  const empty = document.getElementById("drafts-empty");
  if (!list) return;
  try {
    const data = await AlphaAPI.api("/api/ai/drafts");
    list.innerHTML = "";
    if (!data.drafts?.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "No drafts yet. Generate content and save one.";
      }
      return;
    }
    if (empty) empty.hidden = true;
    data.drafts.forEach((draft) => {
      const li = document.createElement("li");
      li.className = "draft-item";
      li.innerHTML = `<span class="platform-pill platform-${escapeHtml(draft.platform)}">${escapeHtml(PLATFORM_LABELS[draft.platform] || draft.platform)}</span>
        <div><strong>${escapeHtml(draft.topic)}</strong>
        <small>${escapeHtml((draft.caption || "").slice(0, 80))}…</small></div>
        <button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-draft="${escapeHtml(draft.id)}">Delete</button>`;
      list.appendChild(li);
    });

    list.querySelectorAll("[data-delete-draft]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-draft");
        try {
          await AlphaAPI.api(`/api/ai/drafts/${id}`, { method: "DELETE" });
          showToast("Draft deleted", "info");
          await renderDrafts();
        } catch (err) {
          showToast(err.message || "Could not delete draft.", "error");
        }
      });
    });
  } catch {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Could not load drafts.";
    }
  }
}

/* ---------- Settings ---------- */

function initSettings() {
  const form = document.getElementById("settings-form");
  if (!form) return;

  AlphaAuth.getSession().then((session) => {
    if (!session) return;
    form.querySelector("#settings-name").value = session.name || "";
    form.querySelector("#settings-email").value = session.email || "";
    if (form.querySelector("#settings-company")) {
      form.querySelector("#settings-company").value = session.company || "";
    }
    if (session.timezone && form.querySelector("#settings-timezone")) {
      form.querySelector("#settings-timezone").value = session.timezone;
    }
    updateProfileName(session.name);
    updateEmailVerifyUI(session);
  });

  document.getElementById("resend-verify-btn")?.addEventListener("click", async () => {
    try {
      await AlphaAPI.api("/api/auth/resend-verification", { method: "POST" });
      showToast("Verification email sent (check inbox or server logs in dev).");
    } catch (err) {
      showToast(err.message || "Could not resend verification.", "error");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = document.getElementById("settings-submit");
    const success = document.getElementById("settings-success");
    const password = form.querySelector("#settings-password");
    const confirm = form.querySelector("#settings-password-confirm");
    const passVal = password?.value || "";
    const confirmVal = confirm?.value || "";

    if (passVal || confirmVal) {
      if (passVal.length < 8) {
        showToast("Password must be at least 8 characters.", "error");
        return;
      }
      if (passVal !== confirmVal) {
        showToast("Passwords do not match.", "error");
        return;
      }
    }

    setButtonLoading(submit, true);
    const result = await AlphaAuth.updateAccount({
      name: form.querySelector("#settings-name")?.value || "",
      email: form.querySelector("#settings-email")?.value || "",
      company: form.querySelector("#settings-company")?.value || "",
      timezone: form.querySelector("#settings-timezone")?.value || "UTC",
      password: passVal || undefined
    });
    setButtonLoading(submit, false);

    if (!result.ok) {
      showToast(result.error || "Could not save settings.", "error");
      return;
    }

    if (password) password.value = "";
    if (confirm) confirm.value = "";
    updateProfileName(result.user.name);
    updateEmailVerifyUI(result.user);
    if (success) success.hidden = false;
    showToast("Settings saved");
    setTimeout(() => {
      if (success) success.hidden = true;
    }, 2500);
  });
}

function updateEmailVerifyUI(user) {
  const status = document.getElementById("email-verify-status");
  const btn = document.getElementById("resend-verify-btn");
  if (!status) return;
  if (user?.emailVerified) {
    status.textContent = "Email verified.";
    if (btn) btn.hidden = true;
  } else {
    status.textContent = "Email not verified yet. Check your inbox for the link.";
    if (btn) btn.hidden = false;
  }
}

function initBilling() {
  const checkoutBtn = document.getElementById("billing-checkout-btn");
  const portalBtn = document.getElementById("billing-portal-btn");
  refreshBillingStatus().catch(() => {});

  checkoutBtn?.addEventListener("click", async () => {
    setButtonLoading(checkoutBtn, true);
    try {
      const data = await AlphaAPI.api("/api/billing/checkout-session", { method: "POST" });
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showToast("Checkout URL missing.", "error");
    } catch (err) {
      const el = document.getElementById("billing-error");
      if (el) {
        el.hidden = false;
        el.textContent = err.message || "Checkout failed.";
      }
      showToast(err.message || "Checkout failed.", "error");
    } finally {
      setButtonLoading(checkoutBtn, false);
    }
  });

  portalBtn?.addEventListener("click", async () => {
    try {
      const data = await AlphaAPI.api("/api/billing/portal-session", { method: "POST" });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      showToast(err.message || "Could not open billing portal.", "error");
    }
  });
}

async function refreshBillingStatus() {
  const statusEl = document.getElementById("billing-status-text");
  const planEl = document.getElementById("billing-plan-text");
  const portalBtn = document.getElementById("billing-portal-btn");
  const checkoutBtn = document.getElementById("billing-checkout-btn");
  try {
    const data = await AlphaAPI.api("/api/billing/status");
    const b = data.billing || {};
    if (statusEl) {
      if (!b.billingConfigured) {
        statusEl.textContent =
          "Stripe not configured yet (set STRIPE_SECRET_KEY + STRIPE_PRICE_GENESIS).";
      } else if (b.hasPaidAccess && b.subscriptionStatus !== "none") {
        statusEl.textContent = `Subscription: ${b.subscriptionStatus}`;
      } else if (b.hasPaidAccess && !b.enforceBilling) {
        statusEl.textContent = "Billing not enforced in this environment — subscribe when ready.";
      } else {
        statusEl.textContent = "No active subscription. Subscribe to generate and schedule.";
      }
    }
    if (planEl) {
      planEl.hidden = false;
      planEl.textContent = `Plan: ${b.plan || "none"} · Paid access: ${b.hasPaidAccess ? "yes" : "no"}`;
    }
    if (portalBtn) portalBtn.hidden = !b.stripeCustomerId;
    if (checkoutBtn && b.subscriptionStatus === "active") {
      checkoutBtn.querySelector(".btn-label").textContent = "Resubscribe / upgrade";
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || "Could not load billing.";
  }
}

function handleBillingQueryFeedback() {
  const params = new URLSearchParams(window.location.search);
  const billing = params.get("billing");
  if (billing === "success") {
    showToast("Payment received — subscription activating via webhook.");
    navigateToSection("settings");
    refreshBillingStatus().catch(() => {});
  } else if (billing === "cancel") {
    showToast("Checkout canceled.", "info");
    navigateToSection("settings");
  }
  if (billing) {
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || "#settings"}`;
    window.history.replaceState({}, "", next);
  }
}

/* ---------- Analytics (real data from /api/analytics/overview) ---------- */

function initAnalytics() {
  const rangeSelect = document.getElementById("analytics-range");
  const refreshBtn = document.getElementById("analytics-refresh");
  if (!rangeSelect && !refreshBtn) return;

  refreshAnalytics().catch(() => {});

  rangeSelect?.addEventListener("change", () => {
    refreshAnalytics().catch(() => {});
  });

  refreshBtn?.addEventListener("click", async () => {
    setButtonLoading(refreshBtn, true);
    await refreshAnalytics().catch(() => {});
    setButtonLoading(refreshBtn, false);
  });
}

async function refreshAnalytics() {
  const range = document.getElementById("analytics-range")?.value || "30";
  try {
    const data = await AlphaAPI.api(`/api/analytics/overview?range=${encodeURIComponent(range)}`);
    renderAnalytics(data);
  } catch (err) {
    showToast(err.message || "Could not load analytics.", "error");
  }
}

function renderAnalytics(data) {
  const totals = data.totals || {};
  const statsRoot = document.getElementById("analytics-stats");
  if (statsRoot) {
    statsRoot.querySelector('[data-metric="total"]').textContent = totals.total ?? 0;
    statsRoot.querySelector('[data-metric="published"]').textContent = totals.published ?? 0;
    statsRoot.querySelector('[data-metric="failed"]').textContent = totals.failed ?? 0;
    statsRoot.querySelector('[data-metric="successRate"]').textContent =
      data.successRate === null || data.successRate === undefined ? "—" : `${data.successRate}%`;
    const totalMeta = statsRoot.querySelector('[data-metric-meta="total"]');
    if (totalMeta) totalMeta.textContent = `in last ${data.range || 30} days`;
  }

  renderAnalyticsTimeline(data.timeline || []);
  renderAnalyticsPlatforms(data.byPlatform || []);

  const topPlatformEl = document.getElementById("analytics-top-platform");
  if (topPlatformEl) {
    topPlatformEl.textContent = data.topPlatform
      ? `${PLATFORM_LABELS[data.topPlatform] || data.topPlatform} is your most-used platform.`
      : "Not enough data yet — schedule a few posts.";
  }

  const connSummary = document.getElementById("analytics-connections-summary");
  if (connSummary) {
    const c = data.connections || { total: 0, active: 0, reconnectRequired: 0 };
    connSummary.textContent =
      c.total === 0
        ? "No accounts connected yet. Visit Social Connections to get started."
        : `${c.active} of ${c.total} connected account(s) healthy${
            c.reconnectRequired ? ` — ${c.reconnectRequired} need reconnecting.` : "."
          }`;
  }
}

function renderAnalyticsTimeline(timeline) {
  const chart = document.getElementById("analytics-timeline-chart");
  const empty = document.getElementById("analytics-timeline-empty");
  if (!chart) return;

  const hasData = timeline.some((d) => d.published || d.failed);
  if (empty) empty.hidden = hasData;
  chart.hidden = !hasData && timeline.length === 0;

  const max = Math.max(...timeline.map((d) => d.published + d.failed), 1);
  chart.innerHTML = timeline
    .map((d) => {
      const pubH = Math.round((d.published / max) * 100);
      const failH = Math.round((d.failed / max) * 100);
      const title = `${d.date}: ${d.published} published, ${d.failed} failed`;
      return `<div class="timeline-bar-col" title="${escapeHtml(title)}">
        ${d.failed ? `<div class="timeline-bar-failed" style="height:${Math.max(failH, 3)}%"></div>` : ""}
        ${d.published ? `<div class="timeline-bar-published" style="height:${Math.max(pubH, 3)}%"></div>` : ""}
      </div>`;
    })
    .join("");
}

function renderAnalyticsPlatforms(byPlatform) {
  const root = document.getElementById("analytics-platform-bars");
  const empty = document.getElementById("analytics-platform-empty");
  if (!root) return;

  if (!byPlatform.length) {
    if (empty) empty.hidden = false;
    root.innerHTML = "";
    return;
  }
  if (empty) empty.hidden = true;

  const max = Math.max(...byPlatform.map((p) => p.total), 1);
  root.innerHTML = byPlatform
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((p) => {
      const pct = Math.round((p.total / max) * 100);
      return `<div class="platform-bar-row">
        <span class="platform-pill platform-${escapeHtml(p.platform)}">${escapeHtml(PLATFORM_LABELS[p.platform] || p.platform)}</span>
        <div class="platform-bar-track"><div class="platform-bar-fill" style="--bar-w:${pct}%"></div></div>
        <span class="platform-bar-count">${p.total}</span>
      </div>`;
    })
    .join("");
}

function disableFutureSprintMocks() {
  ["ai-agents", "inbox"].forEach((id) => {
    const section = document.getElementById(id);
    if (!section) return;
    if (section.querySelector("[data-sprint-gate]")) return;
    const gate = document.createElement("div");
    gate.className = "glass-panel";
    gate.dataset.sprintGate = "1";
    gate.style.padding = "20px";
    gate.style.marginBottom = "16px";
    gate.innerHTML = `<p style="margin:0;color:var(--text-muted)">This section ships in a later sprint. Mock data has been removed.</p>`;
    section.insertBefore(gate, section.children[1] || null);
  });
}

/* ---------- Sprint 6: Leads + CRM ---------- */

function initLeadsCrm() {
  document.getElementById("lead-add-btn")?.addEventListener("click", () => openLeadForm());
  document.getElementById("lead-cancel-btn")?.addEventListener("click", () => {
    const form = document.getElementById("lead-form");
    if (form) form.hidden = true;
  });
  document.getElementById("lead-detail-close")?.addEventListener("click", () => {
    selectedLeadId = null;
    const panel = document.getElementById("lead-detail-panel");
    if (panel) panel.hidden = true;
  });

  ["leads-search", "leads-filter-stage", "leads-filter-followup", "leads-filter-tag"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      refreshLeadsOnly();
    });
    document.getElementById(id)?.addEventListener("change", () => {
      refreshLeadsOnly();
    });
  });

  document.getElementById("lead-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveLeadFromForm();
  });

  document.getElementById("lead-note-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedLeadId) return;
    const body = document.getElementById("lead-note-body")?.value?.trim();
    if (!body) return;
    try {
      await AlphaAPI.api(`/api/leads/${selectedLeadId}/notes`, { method: "POST", body: { body } });
      document.getElementById("lead-note-body").value = "";
      showToast("Note added");
      await openLeadDetail(selectedLeadId);
      await refreshLeadsOnly();
    } catch (err) {
      showToast(err.message || "Could not add note.", "error");
    }
  });
}

async function refreshLeadsOnly() {
  try {
    const [leadsData, statsData] = await Promise.all([
      AlphaAPI.api(buildLeadsQuery()),
      AlphaAPI.api("/api/leads/stats")
    ]);
    cachedLeads = leadsData.leads || [];
    leadStats = statsData;
    renderLeadStats();
    renderLeadsTable();
    renderCrmBoard();
  } catch (err) {
    showToast(err.message || "Could not refresh leads.", "error");
  }
}

function renderLeadStats() {
  setStat("lead-stat-total", leadStats.total || 0);
  setStat("lead-stat-open", leadStats.open || 0);
  setStat("lead-stat-won", leadStats.byStage?.won || 0);
  setStat("lead-stat-followups", leadStats.followUpsDue || 0);
}

function openLeadForm(lead = null) {
  const form = document.getElementById("lead-form");
  if (!form) return;
  form.hidden = false;
  form.reset();
  document.getElementById("lead-id").value = lead?.id || "";
  document.getElementById("lead-name").value = lead?.name || "";
  document.getElementById("lead-email").value = lead?.email || "";
  document.getElementById("lead-phone").value = lead?.phone || "";
  document.getElementById("lead-company").value = lead?.company || "";
  document.getElementById("lead-stage").value = lead?.stage || "new";
  document.getElementById("lead-tags").value = (lead?.tags || []).join(", ");
  document.getElementById("lead-owner-id").value = lead?.ownerId || currentUser?.id || "";
  document.getElementById("lead-owner-name").value =
    lead?.ownerName || currentUser?.name || "You";
  if (lead?.followUpAt) {
    document.getElementById("lead-followup").value = toLocalInput(lead.followUpAt);
  }
  const social = lead?.socialLinks || {};
  document.getElementById("lead-social-website").value = social.website || "";
  document.getElementById("lead-social-linkedin").value = social.linkedin || "";
  document.getElementById("lead-social-instagram").value = social.instagram || "";
  document.getElementById("lead-social-x").value = social.x || "";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function saveLeadFromForm() {
  const id = document.getElementById("lead-id")?.value || "";
  const name = document.getElementById("lead-name")?.value?.trim() || "";
  const email = document.getElementById("lead-email")?.value?.trim() || "";
  hideError("lead-name-error");
  hideError("lead-email-error");
  if (name.length < 2) {
    showError("lead-name-error");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("lead-email-error");
    return;
  }

  const followUpVal = document.getElementById("lead-followup")?.value;
  const payload = {
    name,
    email,
    phone: document.getElementById("lead-phone")?.value?.trim() || "",
    company: document.getElementById("lead-company")?.value?.trim() || "",
    stage: document.getElementById("lead-stage")?.value || "new",
    tags: document.getElementById("lead-tags")?.value || "",
    ownerId: document.getElementById("lead-owner-id")?.value || currentUser?.id || null,
    followUpAt: followUpVal ? localInputToIso(followUpVal) : null,
    socialLinks: {
      website: document.getElementById("lead-social-website")?.value?.trim() || "",
      linkedin: document.getElementById("lead-social-linkedin")?.value?.trim() || "",
      instagram: document.getElementById("lead-social-instagram")?.value?.trim() || "",
      x: document.getElementById("lead-social-x")?.value?.trim() || "",
      facebook: ""
    }
  };

  const btn = document.getElementById("lead-save-btn");
  setButtonLoading(btn, true);
  try {
    if (id) {
      await AlphaAPI.api(`/api/leads/${id}`, { method: "PUT", body: payload });
      showToast("Lead updated");
    } else {
      await AlphaAPI.api("/api/leads", { method: "POST", body: payload });
      showToast("Lead created");
    }
    document.getElementById("lead-form").hidden = true;
    await refreshLeadsOnly();
  } catch (err) {
    showToast(err.message || "Could not save lead.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

function renderLeadsTable() {
  const tbody = document.getElementById("leads-tbody");
  const empty = document.getElementById("leads-empty");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!cachedLeads.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  cachedLeads.forEach((lead) => {
    const tr = document.createElement("tr");
    const follow = lead.followUpAt
      ? new Date(lead.followUpAt).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "—";
    tr.innerHTML = `
      <td><strong>${escapeHtml(lead.name)}</strong>
        ${(lead.tags || []).map((t) => `<span class="stage-pill">${escapeHtml(t)}</span>`).join(" ")}
      </td>
      <td>${escapeHtml(lead.email || "—")}<br><small>${escapeHtml(lead.phone || "")}</small></td>
      <td>${escapeHtml(lead.company || "—")}</td>
      <td><span class="stage-pill stage-${escapeHtml(lead.stage)}">${escapeHtml(LEAD_STAGE_LABELS[lead.stage] || lead.stage)}</span></td>
      <td>${escapeHtml(lead.ownerName || "—")}</td>
      <td>${escapeHtml(follow)}</td>
      <td class="lead-actions">
        <button type="button" class="btn-link" data-lead-view="${lead.id}">Open</button>
        <button type="button" class="btn-link" data-lead-edit="${lead.id}">Edit</button>
        <button type="button" class="btn-link danger" data-lead-delete="${lead.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-lead-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lead = cachedLeads.find((l) => l.id === btn.getAttribute("data-lead-edit"));
      if (lead) openLeadForm(lead);
    });
  });
  tbody.querySelectorAll("[data-lead-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await AlphaAPI.api(`/api/leads/${btn.getAttribute("data-lead-delete")}`, {
          method: "DELETE"
        });
        showToast("Lead deleted", "info");
        await refreshLeadsOnly();
      } catch (err) {
        showToast(err.message || "Delete failed.", "error");
      }
    });
  });
  tbody.querySelectorAll("[data-lead-view]").forEach((btn) => {
    btn.addEventListener("click", () => openLeadDetail(btn.getAttribute("data-lead-view")));
  });
}

async function openLeadDetail(id) {
  selectedLeadId = id;
  const panel = document.getElementById("lead-detail-panel");
  if (panel) panel.hidden = false;
  try {
    const [detail, timeline] = await Promise.all([
      AlphaAPI.api(`/api/leads/${id}`),
      AlphaAPI.api(`/api/leads/${id}/timeline`)
    ]);
    const lead = detail.lead;
    document.getElementById("lead-detail-title").textContent = lead.name;

    const notesList = document.getElementById("lead-notes-list");
    notesList.innerHTML = "";
    (lead.notes || []).forEach((n) => {
      const li = document.createElement("li");
      li.className = "activity-item";
      li.innerHTML = `<span class="activity-dot type-lead_note"></span>
        <div><strong>${escapeHtml(n.body)}</strong>
        <small>${escapeHtml(n.authorName || "")} · ${new Date(n.createdAt).toLocaleString()}</small></div>`;
      notesList.appendChild(li);
    });

    const timelineList = document.getElementById("lead-timeline-list");
    timelineList.innerHTML = "";
    (timeline.timeline || []).slice(0, 20).forEach((item) => {
      const li = document.createElement("li");
      li.className = "activity-item";
      li.innerHTML = `<span class="activity-dot type-${escapeHtml(item.kind)}"></span>
        <div><strong>${escapeHtml(item.message)}</strong>
        <small>${new Date(item.createdAt).toLocaleString()}</small></div>`;
      timelineList.appendChild(li);
    });

    const historyList = document.getElementById("lead-history-list");
    historyList.innerHTML = "";
    (lead.statusHistory || []).forEach((h) => {
      const li = document.createElement("li");
      li.className = "activity-item";
      const label = h.fromStage
        ? `${LEAD_STAGE_LABELS[h.fromStage] || h.fromStage} → ${LEAD_STAGE_LABELS[h.toStage] || h.toStage}`
        : `Created as ${LEAD_STAGE_LABELS[h.toStage] || h.toStage}`;
      li.innerHTML = `<span class="activity-dot type-lead_stage"></span>
        <div><strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(h.note || "")} · ${new Date(h.createdAt).toLocaleString()}</small></div>`;
      historyList.appendChild(li);
    });
  } catch (err) {
    showToast(err.message || "Could not load lead detail.", "error");
  }
}

function renderCrmBoard() {
  const board = document.getElementById("crm-board");
  if (!board) return;

  LEAD_STAGES.forEach((stage) => {
    const zone = board.querySelector(`[data-dropzone="${stage}"]`);
    const countEl = board.querySelector(`[data-stage="${stage}"] [data-count]`);
    if (!zone) return;
    const stageLeads = cachedLeads.filter((l) => l.stage === stage);
    if (countEl) countEl.textContent = String(stageLeads.length);
    zone.innerHTML = "";
    if (!stageLeads.length) {
      zone.innerHTML = `<p class="crm-empty">No leads</p>`;
    } else {
      stageLeads.forEach((lead) => {
        const card = document.createElement("article");
        card.className = "crm-card";
        card.draggable = true;
        card.dataset.leadId = lead.id;
        card.tabIndex = 0;
        card.innerHTML = `
          <strong>${escapeHtml(lead.name)}</strong>
          <span>${escapeHtml(lead.company || lead.email || "No company")}</span>
          <span>${escapeHtml(lead.ownerName || "Unassigned")}${lead.followUpAt ? ` · ${new Date(lead.followUpAt).toLocaleDateString()}` : ""}</span>
          <div class="crm-card-actions">
            <select aria-label="Move ${escapeHtml(lead.name)}" data-move-lead="${lead.id}">
              ${LEAD_STAGES.map(
                (s) =>
                  `<option value="${s}" ${s === lead.stage ? "selected" : ""}>${LEAD_STAGE_LABELS[s]}</option>`
              ).join("")}
            </select>
          </div>`;
        zone.appendChild(card);
      });
    }
  });

  board.querySelectorAll(".crm-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", card.dataset.leadId);
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  board.querySelectorAll("[data-dropzone]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const leadId = e.dataTransfer.getData("text/plain");
      const stage = zone.getAttribute("data-dropzone");
      if (!leadId || !stage) return;
      try {
        await AlphaAPI.api(`/api/leads/${leadId}/stage`, {
          method: "PATCH",
          body: { stage, note: "Moved via kanban" }
        });
        await refreshLeadsOnly();
      } catch (err) {
        showToast(err.message || "Could not move lead.", "error");
      }
    });
  });

  board.querySelectorAll("[data-move-lead]").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await AlphaAPI.api(`/api/leads/${select.getAttribute("data-move-lead")}/stage`, {
          method: "PATCH",
          body: { stage: select.value, note: "Moved via select" }
        });
        await refreshLeadsOnly();
      } catch (err) {
        showToast(err.message || "Could not move lead.", "error");
      }
    });
  });
}
