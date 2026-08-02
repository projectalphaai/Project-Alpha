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
  schedule: { title: "Scheduler", subtitle: "Calendar and list of upcoming posts" },
  connect: { title: "Social Connections", subtitle: "Connect Instagram and Facebook via Meta OAuth" },
  "ai-tools": { title: "AI Content Generator", subtitle: "Generate captions with OpenAI" },
  "ai-agents": { title: "AI Agents", subtitle: "Available in a later sprint" },
  leads: { title: "Leads", subtitle: "Available in a later sprint" },
  crm: { title: "CRM Pipeline", subtitle: "Available in a later sprint" },
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
  initSettings();
  initKeyboardA11y();
  initOAuthQueryFeedback();
  disableFutureSprintMocks();

  await refreshAllData();
  renderWeekChart();
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

async function refreshAllData() {
  try {
    const [connData, postsData] = await Promise.all([
      AlphaAPI.api("/api/connections"),
      AlphaAPI.api("/api/posts")
    ]);
    cachedConnections = connData.connections || {};
    cachedPosts = postsData.posts || [];
    renderConnections();
    renderOverview();
    renderCalendar();
    renderScheduledList();
    renderUpcoming();
    renderActivityFromData();
  } catch (err) {
    showToast(err.message || "Failed to load dashboard data.", "error");
  }
}

function renderOverview() {
  const connectedCount = Object.values(cachedConnections).filter((c) => c.connected).length;
  const upcoming = cachedPosts.filter((p) => new Date(p.scheduledAt || p.datetime) > new Date());

  setStat("stat-connected", connectedCount);
  setStat("scheduled-count", upcoming.length);
  setStat("stat-published", cachedPosts.filter((p) => p.status === "published").length);
  setText("stat-connected-meta", "of 5 platforms");
  setText("stat-scheduled-meta", upcoming.length ? `${upcoming.length} in queue` : "Queue is empty");

  const reachEl = document.getElementById("stat-reach");
  if (reachEl) reachEl.textContent = "—";
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

  const items = [];
  Object.values(cachedConnections)
    .filter((c) => c.connected)
    .forEach((c) => {
      items.push({
        text: `Connected ${PLATFORM_LABELS[c.platform]}${c.accountUsername ? ` (${c.accountUsername})` : ""}`,
        time: c.connectedAt ? new Date(c.connectedAt).toLocaleString() : "Connected",
        type: "connect"
      });
    });
  cachedPosts
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.scheduledAt) - new Date(a.createdAt || a.scheduledAt))
    .slice(0, 5)
    .forEach((p) => {
      items.push({
        text: `Scheduled ${PLATFORM_LABELS[p.platform]} post`,
        time: new Date(p.scheduledAt || p.datetime).toLocaleString(),
        type: "schedule"
      });
    });

  if (!items.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  items.slice(0, 8).forEach((item) => {
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
    .filter((p) => new Date(p.scheduledAt || p.datetime) > new Date())
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
      <small>${escapeHtml(when)}</small></div>`;
    list.appendChild(li);
  });
}

/* ---------- Scheduler ---------- */

let calendarViewDate = new Date();

function initSchedulerViews() {
  const calendarView = document.getElementById("scheduler-calendar-view");
  const listView = document.getElementById("scheduler-list-view");
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
      if (view === "list") renderScheduledList();
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
    .map((p) => {
      const d = new Date(p.scheduledAt || p.datetime);
      if (d.getFullYear() !== year || d.getMonth() !== month) return null;
      return {
        id: p.id,
        day: d.getDate(),
        title: (p.caption || p.content || "").slice(0, 48),
        platform: p.platform,
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
            <span>${PLATFORM_LABELS[ev.platform] || ev.platform} · ${escapeHtml(ev.time)}</span>
            <div class="event-actions">
              <button type="button" class="btn btn-outline-glow btn-sm" data-edit-post="${ev.id}">Edit</button>
              <button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-post="${ev.id}">Delete</button>
            </div>
          </div>`;
        eventList.appendChild(li);
      });
      bindPostActions(eventList);
    }
  }
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
    li.innerHTML = `
      <div class="scheduled-post-main">
        <span class="platform-pill platform-${escapeHtml(post.platform)}">${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}</span>
        <strong>${escapeHtml(caption.slice(0, 90))}${caption.length > 90 ? "…" : ""}</strong>
        <small>${escapeHtml(when)}</small>
      </div>
      <div class="scheduled-post-actions">
        <button type="button" class="btn btn-outline-glow btn-sm" data-edit-post="${post.id}">Edit</button>
        <button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-post="${post.id}">Delete</button>
      </div>`;
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
        showToast("Scheduled post deleted", "info");
        await refreshAllData();
        renderWeekChart();
      } catch (err) {
        showToast(err.message || "Delete failed.", "error");
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
  const success = document.getElementById("schedule-success");
  const idInput = document.getElementById("post-id");

  content?.addEventListener("input", () => {
    if (count) count.textContent = String(content.value.length);
    hideError("content-error");
    content.classList.remove("invalid");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (success) success.hidden = true;
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
    if (!datetime?.value || new Date(datetime.value) <= new Date()) {
      showError("datetime-error");
      datetime?.classList.add("invalid");
      valid = false;
    }
    if (!valid) {
      showToast("Please fix the highlighted fields.", "error");
      return;
    }

    const payload = {
      platform: platform.value,
      caption: contentVal,
      scheduledAt: localInputToIso(datetime.value)
    };

    setButtonLoading(submit, true);
    try {
      const editingId = idInput?.value || "";
      if (editingId) {
        await AlphaAPI.api(`/api/posts/${editingId}`, { method: "PUT", body: payload });
        showToast("Scheduled post updated");
      } else {
        await AlphaAPI.api("/api/posts", { method: "POST", body: payload });
        showToast(`Scheduled for ${PLATFORM_LABELS[payload.platform]}`);
      }
      if (success) success.hidden = false;
      await refreshAllData();
      renderWeekChart();
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
      setButtonLoading(submit, false);
    }
  });
}

/* ---------- Connections / Meta OAuth ---------- */

function initConnectPages() {
  document.querySelectorAll(".connect-card").forEach((card) => {
    const btn = card.querySelector(".connect-btn");
    btn?.addEventListener("click", async () => {
      const platform = card.dataset.platform;
      const state = cachedConnections[platform];
      if (!state?.supported) {
        showToast("Sprint 1 supports Instagram and Facebook OAuth only.", "error");
        return;
      }

      if (state.connected) {
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

      const icon = document.getElementById("oauth-icon");
      const title = document.getElementById("oauth-title");
      const subtitle = document.getElementById("oauth-subtitle");
      const statusEl = document.getElementById("oauth-status");
      if (icon) icon.src = `../img/${platform === "x" ? "x" : platform}.svg`;
      if (title) title.textContent = `Connect ${PLATFORM_LABELS[platform]}`;
      if (subtitle) {
        subtitle.textContent = "You will be redirected to Meta to authorize Project Alpha.";
      }
      if (statusEl) statusEl.textContent = "";
      openModal("oauth-modal");

      const confirmBtn = document.getElementById("oauth-confirm-btn");
      confirmBtn.onclick = async () => {
        setButtonLoading(confirmBtn, true);
        if (statusEl) statusEl.textContent = "Creating secure OAuth session…";
        try {
          const data = await AlphaAPI.api("/api/oauth/meta/start", {
            method: "POST",
            body: { platform }
          });
          window.location.href = data.url;
        } catch (err) {
          setButtonLoading(confirmBtn, false);
          if (statusEl) statusEl.textContent = err.message;
          showToast(err.message || "Could not start OAuth.", "error");
        }
      };
    });
  });
}

function renderConnections() {
  document.querySelectorAll(".connect-card").forEach((card) => {
    const platform = card.dataset.platform;
    const state = cachedConnections[platform] || { connected: false, supported: false };
    const status = card.querySelector("[data-status]");
    const account = card.querySelector("[data-account]");
    const btn = card.querySelector(".connect-btn");

    card.classList.toggle("connected", Boolean(state.connected));
    if (status) {
      status.textContent = state.connected ? "Connected" : state.supported ? "Not connected" : "Unavailable";
      status.classList.toggle("connected", Boolean(state.connected));
    }
    if (account) {
      const label = state.accountUsername || state.accountName || "";
      account.hidden = !state.connected;
      account.textContent = label;
    }
    if (btn) {
      if (!state.supported) {
        btn.textContent = "Unavailable";
        btn.disabled = true;
        btn.classList.remove("btn-glow");
        btn.classList.add("btn-outline-glow");
      } else {
        btn.disabled = false;
        btn.textContent = state.connected ? "Disconnect" : "Connect";
        btn.classList.toggle("btn-glow", state.connected);
        btn.classList.toggle("btn-outline-glow", !state.connected);
      }
    }
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
  ["ai-agents", "leads", "crm", "analytics", "inbox"].forEach((id) => {
    const section = document.getElementById(id);
    if (!section) return;
    if (section.querySelector("[data-sprint-gate]")) return;
    const gate = document.createElement("div");
    gate.className = "glass-panel";
    gate.dataset.sprintGate = "1";
    gate.style.padding = "20px";
    gate.style.marginBottom = "16px";
    gate.innerHTML = `<p style="margin:0;color:var(--text-muted)">This section is outside Sprint 1. Mock data has been removed. Real ${SECTION_META[id]?.title || "features"} ship in a later sprint.</p>`;
    section.insertBefore(gate, section.children[1] || null);
  });
}
