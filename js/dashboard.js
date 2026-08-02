/* Project Alpha — Dashboard (Sprint 1: real API + DB) */

const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube"
};

const SECTION_META = {
  dashboard: { title: "Dashboard", subtitle: "Welcome back — here's your automation overview" },
  schedule: { title: "Scheduler", subtitle: "Calendar, publish queue, and post status" },
  connect: { title: "Social Connections", subtitle: "OAuth for Instagram, Facebook, YouTube, LinkedIn, and X" },
  "ai-tools": { title: "AI Content Generator", subtitle: "Generate captions with OpenAI" },
  "ai-agents": { title: "AI Agents", subtitle: "Available in a later sprint" },
  leads: { title: "Leads", subtitle: "Search, filter, and manage your lead database" },
  crm: { title: "CRM Pipeline", subtitle: "Drag-and-drop kanban synced with PostgreSQL" },
  analytics: { title: "Analytics", subtitle: "Available in a later sprint" },
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
  initKeyboardA11y();
  initOAuthQueryFeedback();
  disableFutureSprintMocks();

  await refreshAllData();
  startDashboardPolling();
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
    const [connData, postsData, activityData, leadsData, statsData, meData] = await Promise.all([
      AlphaAPI.api("/api/connections"),
      AlphaAPI.api("/api/posts"),
      AlphaAPI.api("/api/activity?limit=30"),
      AlphaAPI.api(buildLeadsQuery()),
      AlphaAPI.api("/api/leads/stats"),
      AlphaAPI.api("/api/auth/me")
    ]);
    cachedConnections = connData.connections || {};
    cachedPosts = postsData.posts || [];
    cachedActivity = activityData.activity || [];
    cachedLeads = leadsData.leads || [];
    leadStats = statsData;
    currentUser = meData.user || null;
    renderConnections();
    renderOverview();
    renderCalendar();
    renderScheduledList();
    renderPublishQueue();
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
  const upcoming = cachedPosts.filter(
    (p) => p.status === "scheduled" || p.status === "processing"
  );
  const published = cachedPosts.filter((p) => p.status === "published").length;
  const failed = cachedPosts.filter((p) => p.status === "failed").length;

  setStat("stat-connected", connectedCount);
  setStat("scheduled-count", upcoming.length);
  setStat("stat-published", published);
  setStat("stat-failed", failed);
  setText("stat-connected-meta", "of 5 platforms");
  setText("stat-scheduled-meta", upcoming.length ? `${upcoming.length} in queue` : "Queue is empty");
  setText("stat-published-meta", published ? "Mock publisher" : "None published yet");
  setText("stat-failed-meta", failed ? "Retry from queue" : "No failures");
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

function initSchedulerViews() {
  const calendarView = document.getElementById("scheduler-calendar-view");
  const listView = document.getElementById("scheduler-list-view");
  const queueView = document.getElementById("scheduler-queue-view");
  document.querySelectorAll("[data-scheduler-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-scheduler-view");
      document.querySelectorAll("[data-scheduler-view]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (calendarView) calendarView.hidden = view !== "calendar";
      if (listView) listView.hidden = view !== "list";
      if (queueView) queueView.hidden = view !== "queue";
      if (view === "list") renderScheduledList();
      if (view === "queue") renderPublishQueue();
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
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("cal-month-label");
  const eventList = document.getElementById("event-list");
  if (!grid || !label) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  label.textContent = calendarViewDate.toLocaleString("en-US", { month: "long", year: "numeric" });

  const events = cachedPosts
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
        li.innerHTML = `
          <span class="event-date">${String(ev.day).padStart(2, "0")}</span>
          <div class="event-body">
            <strong>${escapeHtml(ev.title)}</strong>
            <span>${PLATFORM_LABELS[ev.platform] || ev.platform} · ${escapeHtml(ev.time)} · ${statusBadge(ev.status)}</span>
            <div class="event-actions">${postActionButtons(ev.raw)}</div>
          </div>`;
        eventList.appendChild(li);
      });
      bindPostActions(eventList);
    }
  }
}

function postActionButtons(post) {
  const editable = ["draft", "scheduled", "failed"].includes(post.status);
  const cancelable = ["draft", "scheduled", "failed"].includes(post.status);
  const retryable = post.status === "failed";
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
    deletable
      ? `<button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-post="${post.id}">Delete</button>`
      : ""
  ].join("");
}

function renderScheduledList() {
  const list = document.getElementById("scheduled-posts-list");
  const empty = document.getElementById("scheduled-empty");
  if (!list) return;

  const posts = [...cachedPosts].sort(
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
        ${statusBadge(post.status)}
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

  const queue = cachedPosts
    .filter((p) => ["scheduled", "processing", "failed"].includes(p.status))
    .sort((a, b) => new Date(a.scheduledAt || a.datetime) - new Date(b.scheduledAt || b.datetime));

  if (counts) {
    const scheduled = queue.filter((p) => p.status === "scheduled").length;
    const processing = queue.filter((p) => p.status === "processing").length;
    const failed = queue.filter((p) => p.status === "failed").length;
    counts.textContent = `${scheduled} scheduled · ${processing} processing · ${failed} failed`;
  }

  list.innerHTML = "";
  if (!queue.length) {
    if (empty) empty.hidden = false;
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
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
        ${statusBadge(post.status)}
        <strong>${escapeHtml(caption.slice(0, 90))}${caption.length > 90 ? "…" : ""}</strong>
        <small>Due ${escapeHtml(when)} · attempts ${post.attemptCount || 0}/${post.maxAttempts || 3}</small>
        ${post.errorMessage ? `<small class="post-error">${escapeHtml(post.errorMessage)}</small>` : ""}
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
}

function openScheduleModal(post = null) {
  const form = document.getElementById("schedule-form");
  const title = document.getElementById("schedule-modal-title");
  const idInput = document.getElementById("post-id");
  const content = document.getElementById("post-content");
  const platform = document.getElementById("post-platform");
  const datetime = document.getElementById("post-datetime");
  const count = document.getElementById("content-count");
  const success = document.getElementById("schedule-success");
  if (success) success.hidden = true;
  ["content-error", "platform-error", "datetime-error"].forEach(hideError);

  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  if (datetime) datetime.min = minDate.toISOString().slice(0, 16);

  if (post) {
    if (title) title.textContent = "Edit scheduled post";
    if (idInput) idInput.value = post.id;
    if (content) content.value = post.caption || post.content || "";
    if (platform) platform.value = post.platform || "";
    if (datetime) datetime.value = post.datetime || toLocalInput(post.scheduledAt);
  } else {
    if (title) title.textContent = "Create scheduled post";
    form?.reset();
    if (idInput) idInput.value = "";
  }
  if (count) count.textContent = String((content?.value || "").length);
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
  const platform = document.getElementById("post-platform");
  const datetime = document.getElementById("post-datetime");
  const count = document.getElementById("content-count");
  const submit = document.getElementById("schedule-submit");
  const draftBtn = document.getElementById("schedule-save-draft");
  const success = document.getElementById("schedule-success");
  const idInput = document.getElementById("post-id");

  content?.addEventListener("input", () => {
    if (count) count.textContent = String(content.value.length);
    hideError("content-error");
    content.classList.remove("invalid");
  });

  const validateBase = ({ requireFutureTime }) => {
    ["content-error", "platform-error", "datetime-error"].forEach(hideError);
    [content, platform, datetime].forEach((el) => el?.classList.remove("invalid"));
    let valid = true;
    const contentVal = (content?.value || "").trim();
    if (contentVal.length < 10) {
      showError("content-error");
      content?.classList.add("invalid");
      valid = false;
    }
    if (!platform?.value) {
      showError("platform-error");
      platform?.classList.add("invalid");
      valid = false;
    }
    if (requireFutureTime) {
      if (!datetime?.value || new Date(datetime.value) <= new Date()) {
        showError("datetime-error");
        datetime?.classList.add("invalid");
        valid = false;
      }
    }
    return valid;
  };

  const savePost = async ({ status, button }) => {
    if (success) success.hidden = true;
    const requireFutureTime = status === "scheduled";
    if (!validateBase({ requireFutureTime })) {
      showToast("Please fix the highlighted fields.", "error");
      return;
    }

    const payload = {
      platform: platform.value,
      caption: (content?.value || "").trim(),
      status
    };
    if (datetime?.value) payload.scheduledAt = localInputToIso(datetime.value);

    setButtonLoading(button, true);
    try {
      const editingId = idInput?.value || "";
      if (editingId) {
        await AlphaAPI.api(`/api/posts/${editingId}`, { method: "PUT", body: payload });
        showToast(status === "draft" ? "Draft updated" : "Scheduled post updated");
      } else {
        await AlphaAPI.api("/api/posts", { method: "POST", body: payload });
        showToast(
          status === "draft"
            ? "Draft saved"
            : `Scheduled for ${PLATFORM_LABELS[payload.platform]}`
        );
      }
      if (success) success.hidden = false;
      await refreshAllData();
      setTimeout(() => {
        closeModal("schedule-modal");
        form.reset();
        if (idInput) idInput.value = "";
        if (count) count.textContent = "0";
        if (success) success.hidden = true;
      }, 500);
    } catch (err) {
      showToast(err.message || "Could not save post.", "error");
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

function initConnectPages() {
  document.querySelectorAll(".connect-card").forEach((card) => {
    const btn = card.querySelector(".connect-btn");
    const reconnectBtn = card.querySelector(".reconnect-btn");

    btn?.addEventListener("click", async () => {
      const platform = card.dataset.platform;
      const state = cachedConnections[platform] || {};

      if (state.connected && !state.reconnectRequired) {
        btn.disabled = true;
        try {
          await AlphaAPI.api(`/api/connections/${platform}`, { method: "DELETE" });
          showToast(`${PLATFORM_LABELS[platform]} disconnected`, "info");
          await refreshAllData();
        } catch (err) {
          showToast(err.message || "Disconnect failed.", "error");
        } finally {
          btn.disabled = false;
        }
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

    card.classList.toggle("connected", Boolean(state.connected));
    card.classList.toggle("needs-reconnect", Boolean(state.reconnectRequired));

    if (status) {
      if (state.reconnectRequired) status.textContent = "Reconnect required";
      else if (state.connected) {
        status.textContent =
          state.accountCount > 1 ? `Connected (${state.accountCount})` : "Connected";
      } else if (!state.configured) status.textContent = "Credentials not configured";
      else status.textContent = "Not connected";
      status.classList.toggle("connected", Boolean(state.connected) && !state.reconnectRequired);
    }

    if (account) {
      const label = state.accountUsername || state.accountName || "";
      account.hidden = !state.connected;
      account.textContent = label;
    }

    if (configEl) {
      configEl.hidden = state.configured !== false || state.connected;
      configEl.textContent = state.configured
        ? ""
        : "Add provider env vars on the server to enable live OAuth.";
    }

    if (btn) {
      btn.disabled = false;
      if (state.connected && !state.reconnectRequired) {
        btn.textContent = "Disconnect";
        btn.classList.add("btn-glow");
        btn.classList.remove("btn-outline-glow");
      } else {
        btn.textContent = state.configured ? "Connect" : "Connect (needs keys)";
        btn.classList.remove("btn-glow");
        btn.classList.add("btn-outline-glow");
      }
    }

    if (reconnectBtn) {
      reconnectBtn.hidden = !state.reconnectRequired;
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
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(acc.platform)}">${escapeHtml(PLATFORM_LABELS[acc.platform] || acc.platform)}</span>
        <span class="status-badge status-${escapeHtml(acc.status || "active")}">${escapeHtml(acc.status || "active")}</span>
        <strong>${escapeHtml(acc.accountName || acc.accountId)}</strong>
        <small>${escapeHtml(acc.accountUsername || "")} · ${escapeHtml(expiry)}</small>
      </div>
      <div class="scheduled-post-actions">
        ${
          acc.reconnectRequired
            ? `<button type="button" class="btn btn-outline-glow btn-sm" data-reconnect-id="${acc.id}" data-platform="${acc.platform}">Reconnect</button>`
            : `<button type="button" class="btn btn-outline-glow btn-sm" data-refresh-id="${acc.id}">Refresh token</button>`
        }
        <button type="button" class="btn btn-outline-glow btn-sm danger" data-disconnect-id="${acc.id}">Disconnect</button>
      </div>`;
    list.appendChild(li);
  });

  list.querySelectorAll("[data-disconnect-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await AlphaAPI.api(`/api/connections/account/${btn.getAttribute("data-disconnect-id")}`, {
          method: "DELETE"
        });
        showToast("Account disconnected", "info");
        await refreshAllData();
      } catch (err) {
        showToast(err.message || "Disconnect failed.", "error");
      }
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

  list.querySelectorAll("[data-reconnect-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-reconnect-id");
      const platform = btn.getAttribute("data-platform");
      try {
        await AlphaAPI.api(`/api/connections/${id}/reconnect`, { method: "POST" });
      } catch {
        /* continue */
      }
      startOAuthFlow(platform, { mode: "reconnect", connectionId: id });
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
    if (success) success.hidden = false;
    showToast("Settings saved");
    setTimeout(() => {
      if (success) success.hidden = true;
    }, 2500);
  });
}

function disableFutureSprintMocks() {
  ["ai-agents", "analytics", "inbox"].forEach((id) => {
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
