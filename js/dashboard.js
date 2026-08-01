/* Project Alpha AI — Dashboard */

const STORAGE_KEYS = {
    connections: "pa_connections",
    posts: "pa_scheduled_posts",
    settings: "pa_settings",
    leads: "pa_leads",
    agents: "pa_agents"
};

const SECTION_META = {
    dashboard: { title: "Dashboard", subtitle: "Welcome back — here's your automation overview" },
    calendar: { title: "Content Calendar", subtitle: "Plan and review scheduled posts" },
    schedule: { title: "Schedule Post", subtitle: "Create and queue content for publishing" },
    connect: { title: "Connect Pages", subtitle: "Link your social accounts securely" },
    "ai-tools": { title: "AI Tools", subtitle: "Generate captions, hashtags, and post ideas" },
    "ai-agents": { title: "AI Agents", subtitle: "Activate specialist agents and run demo tasks" },
    leads: { title: "Leads", subtitle: "Capture and manage prospects" },
    crm: { title: "CRM Pipeline", subtitle: "Move deals from New to Closed" },
    analytics: { title: "Analytics", subtitle: "Performance insights across platforms" },
    inbox: { title: "Inbox", subtitle: "Comments and messages in one place" },
    settings: { title: "Settings", subtitle: "Manage your account preferences" }
};

const CRM_STAGES = ["new", "contacted", "qualified", "closed"];
const CRM_LABELS = { new: "New", contacted: "Contacted", qualified: "Qualified", closed: "Closed" };

const DEFAULT_LEADS = [
    { id: 1, name: "Jordan Lee", email: "jordan@northstar.io", company: "Northstar", stage: "new" },
    { id: 2, name: "Priya Shah", email: "priya@bloom.agency", company: "Bloom Agency", stage: "contacted" },
    { id: 3, name: "Marcus Chen", email: "m.chen@createlabs.co", company: "Create Labs", stage: "qualified" }
];

const PLATFORM_LABELS = {
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    x: "X (Twitter)",
    youtube: "YouTube"
};

const chartInstances = [];

const SAMPLE_EVENTS = [
    { day: 3, title: "Product teaser reel", platform: "instagram", time: "10:00" },
    { day: 7, title: "Weekly tips carousel", platform: "linkedin", time: "11:30" },
    { day: 12, title: "Community AMA", platform: "x", time: "16:00" },
    { day: 15, title: "Behind-the-scenes story", platform: "instagram", time: "09:00" },
    { day: 18, title: "Feature highlight video", platform: "youtube", time: "14:00" },
    { day: 22, title: "Customer success post", platform: "facebook", time: "13:00" },
    { day: 28, title: "Month-end roundup", platform: "linkedin", time: "10:30" }
];

let navigateToSection = () => {};

document.addEventListener("DOMContentLoaded", () => {
    if (window.AlphaAuth && !AlphaAuth.requireAuth("./login.html")) return;

    initAuthUI();
    initMobileSidebar();
    navigateToSection = initSidebarNav();
    initDropdowns();
    initDashParticles();
    initStatCounters();
    initCharts();
    initCalendar();
    initScheduleForm();
    initConnectPages();
    initAITools();
    initAIAgents();
    initLeadsAndCRM();
    initAnalytics();
    initInbox();
    initSettings();
    initSectionEntrance();
    initKeyboardA11y();
});

function initAuthUI() {
    const session = window.AlphaAuth?.getSession?.();
    if (session?.name) updateProfileName(session.name);

    document.getElementById("logout-btn")?.addEventListener("click", () => {
        AlphaAuth.logout();
        showToast("Logged out", "info");
        setTimeout(() => {
            window.location.href = "./login.html";
        }, 350);
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

/* ---------- Dashboard particles ---------- */

function initDashParticles() {
    const canvas = document.getElementById("dash-particle-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let particles = [];
    let width = 0;
    let height = 0;
    let rafId = 0;

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const create = (count) => {
        particles = Array.from({ length: count }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.8 + 0.4,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            a: Math.random() * 0.35 + 0.1
        }));
    };

    const draw = () => {
        ctx.clearRect(0, 0, width, height);
        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${p.a})`;
            ctx.fill();
        });
        rafId = requestAnimationFrame(draw);
    };

    resize();
    create(prefersReducedMotion ? 18 : 42);
    if (!prefersReducedMotion) draw();
    else {
        draw();
        cancelAnimationFrame(rafId);
    }

    let timer;
    window.addEventListener("resize", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            resize();
            create(prefersReducedMotion ? 18 : 42);
        }, 150);
    });
}

/* ---------- Animated overview counters ---------- */

function initStatCounters() {
    const els = document.querySelectorAll(".stat-value[data-count]");
    if (!els.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = (el) => {
        if (el.dataset.counted === "true") return;
        el.dataset.counted = "true";

        const target = parseFloat(el.dataset.count);
        const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const useComma = el.dataset.format === "comma";

        const format = (n) => {
            let value;
            if (decimals > 0) value = n.toFixed(decimals);
            else value = String(Math.floor(n));
            if (useComma) value = Number(value).toLocaleString();
            return prefix + value + suffix;
        };

        if (prefersReducedMotion) {
            el.textContent = format(target);
            return;
        }

        const start = performance.now();
        const duration = 1600;
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = format(eased * target);
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = format(target);
        };
        requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    run(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.4 }
    );

    els.forEach((el) => observer.observe(el));
}

function initSectionEntrance() {
    const active = document.querySelector(".dashboard-section.active");
    if (!active) return;
    active.classList.add("section-enter");
    requestAnimationFrame(() => active.classList.add("section-enter-active"));
}

/* ---------- Utils ---------- */

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
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    const label = btn.querySelector(".btn-label");
    const spinner = btn.querySelector(".btn-spinner");
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
    if (spinner) spinner.hidden = !loading;
    if (label) label.style.opacity = loading ? "0.55" : "1";
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore quota errors in MVP */
    }
}

function typeText(el, text, speed = 14) {
    return new Promise((resolve) => {
        el.textContent = "";
        el.classList.add("typing");
        let i = 0;
        const tick = () => {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i += 1;
                setTimeout(tick, speed);
            } else {
                el.classList.remove("typing");
                resolve();
            }
        };
        tick();
    });
}

/* ---------- Mobile sidebar ---------- */

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

/* ---------- Navigation ---------- */

function initSidebarNav() {
    const dashboardSections = document.querySelectorAll(".dashboard-section");
    const titleEl = document.getElementById("dash-title");
    const subtitleEl = document.getElementById("dash-subtitle");

    const showSection = (targetId) => {
        if (!targetId) return;
        const platformIds = ["instagram", "facebook", "linkedin", "x", "youtube"];
        const aiToolIds = ["ai-caption", "ai-hashtag", "ai-post-idea"];

        let sectionToShow = targetId;
        if (platformIds.includes(targetId)) sectionToShow = "connect";
        else if (aiToolIds.includes(targetId)) sectionToShow = "ai-tools";

        dashboardSections.forEach((section) => {
            section.classList.toggle("active", section.id === sectionToShow);
        });

        document.querySelectorAll(".sidebar-nav a").forEach((link) => {
            if (!link.classList.contains("dropdown-toggle")) {
                link.classList.remove("active");
            }
        });

        const activeLink = document.querySelector(`.sidebar-nav a[href="#${targetId}"]`);
        if (activeLink) {
            activeLink.classList.add("active");
            const parentDropdown = activeLink.closest(".dropdown-menu");
            if (parentDropdown) {
                const toggle = parentDropdown.previousElementSibling;
                if (toggle) toggle.classList.add("active");
            }
        } else {
            const mainLink = document.querySelector(`.sidebar-nav a[data-section="${sectionToShow}"]`);
            mainLink?.classList.add("active");
        }

        const meta = SECTION_META[sectionToShow];
        if (meta) {
            if (titleEl) titleEl.textContent = meta.title;
            if (subtitleEl) subtitleEl.textContent = meta.subtitle;
        }

        if (platformIds.includes(targetId) || aiToolIds.includes(targetId)) {
            const scrollTarget = document.getElementById(targetId);
            if (scrollTarget) {
                setTimeout(() => scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
            }
        }

        if (window.innerWidth <= 768) {
            document.getElementById("sidebar")?.classList.remove("open");
            document.getElementById("sidebar-overlay")?.classList.remove("visible");
            document.body.classList.remove("sidebar-open");
        }

        if (history.replaceState) {
            history.replaceState(null, "", `#${targetId}`);
        }

        const shown = document.getElementById(sectionToShow);
        if (shown) {
            shown.classList.remove("section-enter", "section-enter-active");
            void shown.offsetWidth;
            shown.classList.add("section-enter");
            requestAnimationFrame(() => shown.classList.add("section-enter-active"));
        }

        if (sectionToShow === "dashboard" || sectionToShow === "analytics") {
            requestAnimationFrame(() => {
                chartInstances.forEach((chart) => {
                    try {
                        chart.resize();
                    } catch {
                        /* ignore */
                    }
                });
            });
        }
    };

    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
        link.addEventListener("click", function (e) {
            const href = this.getAttribute("href");
            if (!href || !href.startsWith("#")) return;

            if (this.classList.contains("dropdown-toggle")) {
                e.preventDefault();
                return;
            }

            e.preventDefault();
            showSection(href.substring(1));
        });
    });

    const hash = window.location.hash.replace("#", "");
    const valid = Object.keys(SECTION_META).concat([
        "instagram", "facebook", "linkedin", "x", "youtube",
        "ai-caption", "ai-hashtag", "ai-post-idea"
    ]);
    showSection(valid.includes(hash) ? hash : "dashboard");
    return showSection;
}

function setChartCardState(id, state) {
    const card = document.querySelector(`[data-chart-card="${id}"]`);
    if (!card) return;
    const skeleton = card.querySelector(".chart-skeleton");
    const error = card.querySelector(".chart-error");
    const wrapper = card.querySelector(".chart-wrapper");
    card.classList.toggle("is-loading", state === "loading");
    card.classList.toggle("has-error", state === "error");
    if (skeleton) skeleton.hidden = state !== "loading";
    if (error) error.hidden = state !== "error";
    if (wrapper) wrapper.hidden = state !== "ready";
}

function initDropdowns() {
    document.querySelectorAll(".dropdown-toggle").forEach((toggle) => {
        toggle.addEventListener("click", function (e) {
            e.preventDefault();
            const wasActive = this.classList.contains("active");
            document.querySelectorAll(".dropdown-toggle").forEach((t) => {
                if (t !== this) t.classList.remove("active");
            });
            this.classList.toggle("active", !wasActive);

            const section = this.getAttribute("data-section");
            if (section) navigateToSection(section);
        });
    });
}

/* ---------- Charts ---------- */

function initCharts() {
    const chartIds = [
        "postPerformanceChart",
        "audienceGrowthChart",
        "engagementMetricsChart",
        "reachImpressionsChart"
    ];
    chartIds.forEach((id) => setChartCardState(id, "loading"));

    const tryInit = (attempt = 0) => {
        if (typeof Chart === "undefined") {
            if (attempt < 12) {
                setTimeout(() => tryInit(attempt + 1), 200);
                return;
            }
            chartIds.forEach((id) => setChartCardState(id, "error"));
            showToast("Charts failed to load. Analytics UI still works.", "error");
            return;
        }

        Chart.defaults.color = "#94a3b8";
        Chart.defaults.borderColor = "rgba(255, 255, 255, 0.06)";
        Chart.defaults.font.family = "'Inter', sans-serif";

        const chartDefaults = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(255, 255, 255, 0.06)" },
                    ticks: { color: "#94a3b8", font: { size: 11 } }
                },
                x: {
                    grid: { color: "rgba(255, 255, 255, 0.04)" },
                    ticks: { color: "#94a3b8", font: { size: 11 } }
                }
            },
            plugins: {
                legend: {
                    labels: { color: "#f1f5f9", font: { size: 12 }, boxWidth: 12 }
                }
            }
        };

        const doughnutDefaults = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: "#f1f5f9", font: { size: 12 }, padding: 16 }
                }
            }
        };

        const makeChart = (id, config) => {
            const el = document.getElementById(id);
            if (!el) return null;
            try {
                const chart = new Chart(el, config);
                chartInstances.push(chart);
                setChartCardState(id, "ready");
                return chart;
            } catch {
                setChartCardState(id, "error");
                return null;
            }
        };

        makeChart("postPerformanceChart", {
            type: "bar",
            data: {
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                datasets: [{
                    label: "Posts",
                    data: [120, 190, 150, 210, 180, 240],
                    backgroundColor: "rgba(59, 130, 246, 0.55)",
                    borderColor: "rgba(59, 130, 246, 1)",
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: chartDefaults
        });

        makeChart("audienceGrowthChart", {
            type: "line",
            data: {
                labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
                datasets: [{
                    label: "New Followers",
                    data: [100, 150, 120, 200],
                    backgroundColor: "rgba(139, 92, 246, 0.2)",
                    borderColor: "rgba(139, 92, 246, 1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#8b5cf6",
                    pointRadius: 4
                }]
            },
            options: chartDefaults
        });

        makeChart("engagementMetricsChart", {
            type: "doughnut",
            data: {
                labels: ["Likes", "Comments", "Shares"],
                datasets: [{
                    data: [300, 150, 75],
                    backgroundColor: [
                        "rgba(59, 130, 246, 0.75)",
                        "rgba(139, 92, 246, 0.75)",
                        "rgba(6, 182, 212, 0.75)"
                    ],
                    borderColor: ["#3b82f6", "#8b5cf6", "#06b6d4"],
                    borderWidth: 1
                }]
            },
            options: doughnutDefaults
        });

        window.__reachChart = makeChart("reachImpressionsChart", {
            type: "line",
            data: {
                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                datasets: [
                    {
                        label: "Reach",
                        data: [5000, 6500, 4800, 7000, 6000, 8000, 7500],
                        backgroundColor: "rgba(6, 182, 212, 0.15)",
                        borderColor: "rgba(6, 182, 212, 1)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3
                    },
                    {
                        label: "Impressions",
                        data: [7200, 8100, 6900, 9200, 8600, 10400, 9800],
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        borderColor: "rgba(59, 130, 246, 1)",
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3
                    }
                ]
            },
            options: chartDefaults
        });
    };

    tryInit();
}

/* ---------- Calendar ---------- */

function initCalendar() {
    const grid = document.getElementById("calendar-grid");
    const label = document.getElementById("cal-month-label");
    const eventList = document.getElementById("event-list");
    if (!grid || !label) return;

    let viewDate = new Date(2026, 7, 1); // August 2026 (matches user date context)

    const getUserPosts = () => loadJSON(STORAGE_KEYS.posts, []);

    const eventsForMonth = (year, month) => {
        const samples = SAMPLE_EVENTS
            .filter(() => year === 2026 && month === 7)
            .map((e) => ({
                day: e.day,
                title: e.title,
                platform: e.platform,
                time: e.time,
                source: "sample"
            }));

        const user = getUserPosts()
            .map((p) => {
                const d = new Date(p.datetime);
                if (d.getFullYear() !== year || d.getMonth() !== month) return null;
                return {
                    day: d.getDate(),
                    title: p.content.slice(0, 48) + (p.content.length > 48 ? "…" : ""),
                    platform: p.platform,
                    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    source: "user"
                };
            })
            .filter(Boolean);

        return [...samples, ...user].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    };

    const render = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        label.textContent = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const events = eventsForMonth(year, month);
        const byDay = {};
        events.forEach((ev) => {
            if (!byDay[ev.day]) byDay[ev.day] = [];
            byDay[ev.day].push(ev);
        });

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
            const isToday =
                today.getFullYear() === year &&
                today.getMonth() === month &&
                today.getDate() === day;
            if (isToday) cell.classList.add("today");
            if (byDay[day]) cell.classList.add("has-events");

            const num = document.createElement("span");
            num.className = "cal-day-num";
            num.textContent = String(day);
            cell.appendChild(num);

            if (byDay[day]) {
                const dots = document.createElement("div");
                dots.className = "cal-dots";
                byDay[day].slice(0, 3).forEach((ev) => {
                    const dot = document.createElement("span");
                    dot.className = `cal-dot platform-${ev.platform}`;
                    dot.title = ev.title;
                    dots.appendChild(dot);
                });
                cell.appendChild(dots);
            }

            cell.addEventListener("click", () => {
                grid.querySelectorAll(".cal-day.selected").forEach((d) => d.classList.remove("selected"));
                cell.classList.add("selected");
                highlightDayEvents(day);
            });

            grid.appendChild(cell);
        }

        if (eventList) {
            eventList.innerHTML = "";
            if (!events.length) {
                const li = document.createElement("li");
                li.className = "event-empty";
                li.textContent = "No posts scheduled this month.";
                eventList.appendChild(li);
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
                        </div>
                    `;
                    eventList.appendChild(li);
                });
            }
        }

        updateScheduledCount();
    };

    const highlightDayEvents = (day) => {
        eventList?.querySelectorAll(".event-item").forEach((item) => {
            item.classList.toggle("highlight", item.dataset.day === String(day));
        });
    };

    document.getElementById("cal-prev")?.addEventListener("click", () => {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
        render();
    });
    document.getElementById("cal-next")?.addEventListener("click", () => {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
        render();
    });
    document.getElementById("cal-today")?.addEventListener("click", () => {
        const now = new Date();
        viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
        render();
    });

    window.refreshCalendar = render;
    render();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function updateScheduledCount() {
    const el = document.getElementById("scheduled-count");
    if (!el) return;
    const userPosts = loadJSON(STORAGE_KEYS.posts, []).length;
    const total = 35 + userPosts;
    el.dataset.count = String(total);
    el.textContent = String(total);
}

/* ---------- Schedule form ---------- */

function initScheduleForm() {
    const form = document.getElementById("schedule-form");
    if (!form) return;

    const content = document.getElementById("post-content");
    const platform = document.getElementById("post-platform");
    const datetime = document.getElementById("post-datetime");
    const media = document.getElementById("post-media");
    const count = document.getElementById("content-count");
    const submit = document.getElementById("schedule-submit");
    const success = document.getElementById("schedule-success");

    const minDate = new Date();
    minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
    if (datetime) datetime.min = minDate.toISOString().slice(0, 16);

    content?.addEventListener("input", () => {
        if (count) count.textContent = String(content.value.length);
        hideError("content-error");
        content.classList.remove("invalid");
    });

    platform?.addEventListener("change", () => {
        hideError("platform-error");
        platform.classList.remove("invalid");
    });

    datetime?.addEventListener("change", () => {
        hideError("datetime-error");
        datetime.classList.remove("invalid");
    });

    media?.addEventListener("input", () => {
        hideError("media-error");
        media.classList.remove("invalid");
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        success.hidden = true;

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
        const dtVal = datetime?.value;
        if (!dtVal || new Date(dtVal) <= new Date()) {
            showError("datetime-error");
            datetime?.classList.add("invalid");
            valid = false;
        }
        const mediaVal = (media?.value || "").trim();
        if (mediaVal && !/^https?:\/\/.+/i.test(mediaVal)) {
            showError("media-error");
            media?.classList.add("invalid");
            valid = false;
        }

        if (!valid) {
            showToast("Please fix the highlighted fields.", "error");
            return;
        }

        const platformVal = platform.value;
        setButtonLoading(submit, true);
        await delay(1100);

        const posts = loadJSON(STORAGE_KEYS.posts, []);
        posts.push({
            id: Date.now(),
            content: contentVal,
            platform: platformVal,
            datetime: dtVal,
            media: mediaVal || null
        });
        saveJSON(STORAGE_KEYS.posts, posts);

        setButtonLoading(submit, false);
        success.hidden = false;
        form.reset();
        if (count) count.textContent = "0";
        showToast(`Scheduled for ${PLATFORM_LABELS[platformVal] || platformVal}`);
        if (typeof window.refreshCalendar === "function") window.refreshCalendar();
        updateScheduledCount();

        setTimeout(() => {
            success.hidden = true;
        }, 4000);
    });
}

function showError(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
}

function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
}

/* ---------- Connect pages ---------- */

function initConnectPages() {
    const defaultState = {
        instagram: false,
        facebook: false,
        linkedin: false,
        x: false,
        youtube: false
    };
    let state = { ...defaultState, ...loadJSON(STORAGE_KEYS.connections, {}) };

    const renderCard = (card) => {
        const platform = card.dataset.platform;
        const connected = Boolean(state[platform]);
        const status = card.querySelector("[data-status]");
        const btn = card.querySelector(".connect-btn");

        card.classList.toggle("connected", connected);
        if (status) {
            status.textContent = connected ? "Connected" : "Not connected";
            status.classList.toggle("connected", connected);
        }
        if (btn) {
            btn.textContent = connected ? "Disconnect" : "Connect";
            btn.dataset.action = connected ? "disconnect" : "connect";
            btn.classList.toggle("btn-glow", connected);
            btn.classList.toggle("btn-outline-glow", !connected);
        }
    };

    document.querySelectorAll(".connect-card").forEach((card) => {
        renderCard(card);
        const btn = card.querySelector(".connect-btn");
        btn?.addEventListener("click", async () => {
            const platform = card.dataset.platform;
            const connecting = btn.dataset.action === "connect";
            btn.disabled = true;
            btn.classList.add("is-loading");
            const original = btn.textContent;
            btn.textContent = connecting ? "Connecting…" : "Disconnecting…";

            await delay(900);

            state[platform] = connecting;
            saveJSON(STORAGE_KEYS.connections, state);
            btn.disabled = false;
            btn.classList.remove("is-loading");
            renderCard(card);
            showToast(
                connecting
                    ? `${PLATFORM_LABELS[platform]} connected`
                    : `${PLATFORM_LABELS[platform]} disconnected`,
                connecting ? "success" : "info"
            );
            if (!connecting && original) {
                /* text already set by renderCard */
            }
        });
    });
}

/* ---------- AI Tools ---------- */

function initAITools() {
    const generators = {
        caption: (topic) => {
            const t = topic.trim();
            const variants = [
                `${t} — designed for creators who refuse to settle. Lead with clarity, ship with confidence, and let the results speak. #${slugTag(t)} #Innovation #Creators`,
                `Ready for ${t}? Here's the move: show up consistently, stay authentic, and let AI handle the busywork while you focus on what matters.`,
                `Big energy around ${t}. Tell your story in one scroll-stopping line — then back it with proof. Your audience is waiting.`
            ];
            return variants[Math.floor(Math.random() * variants.length)];
        },
        hashtag: (topic) => {
            const base = slugTag(topic) || "content";
            return [
                `#${base}`,
                `#${base}Tips`,
                "#socialmediamarketing",
                "#contentcreator",
                "#digitalstrategy",
                "#brandgrowth",
                "#AItools",
                "#engagement",
                "#creatoreconomy",
                "#marketingtips"
            ].join(" ");
        },
        "post-idea": (topic) => {
            const t = topic.trim() || "your brand";
            return [
                `1. Carousel: "5 myths about ${t}" with a strong hook on slide 1.`,
                `2. Short video: Day-in-the-life using ${t} — keep it under 30s.`,
                `3. Poll story: Ask followers which ${t} tip they want next.`,
                `4. Case study post: Before/after results tied to ${t}.`,
                `5. Thread: Hot take + 3 actionable steps for ${t} beginners.`
            ].join("\n");
        }
    };

    document.querySelectorAll(".ai-tool-card").forEach((card) => {
        const tool = card.dataset.tool;
        const textarea = card.querySelector("textarea");
        const btn = card.querySelector(".generate-btn");
        const output = card.querySelector("[data-output]");
        const error = card.querySelector("[data-error]");
        const copyBtn = card.querySelector("[data-copy]");

        textarea?.addEventListener("input", () => {
            if (error) error.hidden = true;
            textarea.classList.remove("invalid");
        });

        btn?.addEventListener("click", async () => {
            const value = (textarea?.value || "").trim();
            if (value.length < 2) {
                if (error) error.hidden = false;
                textarea?.classList.add("invalid");
                showToast("Enter a short topic first.", "error");
                return;
            }

            setButtonLoading(btn, true);
            if (output) {
                output.classList.remove("ready");
                output.textContent = "Alpha AI is thinking…";
            }
            if (copyBtn) copyBtn.hidden = true;

            await delay(1400 + Math.random() * 600);

            const result = generators[tool]?.(value) || "Unable to generate.";
            setButtonLoading(btn, false);

            if (output) {
                await typeText(output, result, tool === "post-idea" ? 8 : 12);
                output.classList.add("ready");
            }
            if (copyBtn) copyBtn.hidden = false;
            showToast("Generation complete");
        });

        copyBtn?.addEventListener("click", async () => {
            const text = output?.textContent || "";
            try {
                await navigator.clipboard.writeText(text);
                showToast("Copied to clipboard");
            } catch {
                showToast("Could not copy — select text manually.", "error");
            }
        });
    });
}

function slugTag(text) {
    const word = text.trim().split(/\s+/)[0] || "";
    return word.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18) || "Growth";
}

/* ---------- Inbox ---------- */

function initInbox() {
    const list = document.getElementById("inbox-list");
    if (!list) return;

    list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-mark-read]");
        if (!btn) return;
        const item = btn.closest(".inbox-item");
        item?.classList.remove("unread");
        btn.hidden = true;
        showToast("Marked as read");
    });

    document.getElementById("inbox-mark-all")?.addEventListener("click", () => {
        list.querySelectorAll(".inbox-item.unread").forEach((item) => {
            item.classList.remove("unread");
            const btn = item.querySelector("[data-mark-read]");
            if (btn) btn.hidden = true;
        });
        showToast("All messages marked read");
    });
}

/* ---------- Analytics ---------- */

function initAnalytics() {
    const range = document.getElementById("analytics-range");
    const refresh = document.getElementById("analytics-refresh");
    if (!range && !refresh) return;

    const metricsByRange = {
        7: {
            impressions: "12.4K",
            reach: "8.1K",
            visits: "640",
            clicks: "210",
            changes: { impressions: "+4.2%", reach: "+3.1%", visits: "+8%", clicks: "+1.4%" },
            positive: { impressions: true, reach: true, visits: true, clicks: true },
            reachData: [4200, 4800, 3900, 5100, 4700, 5600, 5300],
            impressionData: [6100, 6800, 5900, 7200, 7000, 7900, 7600]
        },
        30: {
            impressions: "48.2K",
            reach: "31.7K",
            visits: "2,840",
            clicks: "891",
            changes: { impressions: "+9.4%", reach: "+6.1%", visits: "+14%", clicks: "−2.1%" },
            positive: { impressions: true, reach: true, visits: true, clicks: false },
            reachData: [5000, 6500, 4800, 7000, 6000, 8000, 7500],
            impressionData: [7200, 8100, 6900, 9200, 8600, 10400, 9800]
        },
        90: {
            impressions: "142K",
            reach: "96.4K",
            visits: "8,120",
            clicks: "2,640",
            changes: { impressions: "+18%", reach: "+12%", visits: "+21%", clicks: "+5.6%" },
            positive: { impressions: true, reach: true, visits: true, clicks: true },
            reachData: [6200, 7100, 6800, 8400, 7900, 9100, 8800],
            impressionData: [9100, 10200, 9800, 11400, 10900, 12600, 12100]
        }
    };

    const applyMetrics = async (days, withLoading) => {
        const data = metricsByRange[days] || metricsByRange[30];
        if (withLoading) {
            document.getElementById("analytics-stats")?.classList.add("is-loading");
            setButtonLoading(refresh, true);
            setChartCardState("reachImpressionsChart", "loading");
            await delay(700);
        }

        Object.keys(data.changes).forEach((key) => {
            const valueEl = document.querySelector(`[data-metric="${key}"]`);
            const changeEl = document.querySelector(`[data-metric-change="${key}"]`);
            if (valueEl) valueEl.textContent = data[key];
            if (changeEl) {
                changeEl.textContent = data.changes[key];
                changeEl.classList.toggle("positive", Boolean(data.positive[key]));
            }
        });

        if (window.__reachChart && typeof Chart !== "undefined") {
            window.__reachChart.data.datasets[0].data = data.reachData;
            window.__reachChart.data.datasets[1].data = data.impressionData;
            window.__reachChart.update();
            setChartCardState("reachImpressionsChart", "ready");
        } else if (typeof Chart === "undefined") {
            setChartCardState("reachImpressionsChart", "error");
        }

        document.getElementById("analytics-stats")?.classList.remove("is-loading");
        setButtonLoading(refresh, false);
        if (withLoading) showToast(`Analytics updated · last ${days} days`);
    };

    range?.addEventListener("change", () => applyMetrics(range.value, true));
    refresh?.addEventListener("click", () => applyMetrics(range?.value || "30", true));
}

/* ---------- AI Agents ---------- */

function initAIAgents() {
    const grid = document.getElementById("agents-grid");
    if (!grid) return;

    let activeMap = loadJSON(STORAGE_KEYS.agents, {});

    const responses = {
        "content-writer": (input) =>
            `Draft caption for “${input || "your campaign"}”:\n\nUnlock the next chapter. We built this for teams who ship daily and still want polish. Soft launch tonight — full drop tomorrow.\n\nCTA: Save this post & share with a creator who needs it.`,
        "hashtag-strategist": (input) => {
            const tag = slugTag(input || "Growth");
            return `Strategy pack for ${input || "your niche"}:\n#${tag} #${tag}Tips #CreatorEconomy #SocialStrategy #BrandGrowth #ContentOps #AIMarketing #EngageAndGrow`;
        },
        "analytics-advisor": (input) =>
            `Advisory (${input || "engagement"}):\n• Peak windows look strong Tue–Thu mid-day.\n• Carousel posts outperform single images by ~22% in your mock data.\n• Next experiment: A/B hook lines in the first 8 words, measure saves + profile visits.`,
        "inbox-responder": (input) =>
            `Suggested reply:\n\n“Thanks for reaching out${input ? ` about “${input.slice(0, 48)}”` : ""}! We’d love to help — mind sharing a bit more context so we can point you to the right next step?”`
    };

    const renderCard = (card) => {
        const id = card.dataset.agent;
        const active = Boolean(activeMap[id]);
        const status = card.querySelector("[data-agent-status]");
        const activateBtn = card.querySelector("[data-agent-activate]");
        const runBtn = card.querySelector("[data-agent-run]");
        card.classList.toggle("is-active", active);
        if (status) {
            status.textContent = active ? "Active" : "Idle";
            status.classList.toggle("active", active);
        }
        if (activateBtn) activateBtn.textContent = active ? "Deactivate" : "Activate";
        if (runBtn) runBtn.disabled = !active;
    };

    grid.querySelectorAll(".agent-card").forEach((card) => {
        renderCard(card);

        card.querySelector("[data-agent-activate]")?.addEventListener("click", () => {
            const id = card.dataset.agent;
            activeMap[id] = !activeMap[id];
            saveJSON(STORAGE_KEYS.agents, activeMap);
            renderCard(card);
            showToast(activeMap[id] ? "Agent activated" : "Agent deactivated", activeMap[id] ? "success" : "info");
        });

        card.querySelector("[data-agent-run]")?.addEventListener("click", async () => {
            const id = card.dataset.agent;
            if (!activeMap[id]) {
                showToast("Activate the agent first.", "error");
                return;
            }
            const runBtn = card.querySelector("[data-agent-run]");
            const output = card.querySelector("[data-agent-output]");
            const input = card.querySelector("textarea")?.value.trim() || "";
            setButtonLoading(runBtn, true);
            if (output) output.textContent = "Agent is working…";
            await delay(1200 + Math.random() * 800);
            const text = responses[id]?.(input) || "No response.";
            if (output) await typeText(output, text, 10);
            setButtonLoading(runBtn, false);
            showToast("Agent run complete");
        });
    });
}

/* ---------- Leads + CRM ---------- */

function getLeads() {
    const stored = loadJSON(STORAGE_KEYS.leads, null);
    if (!stored) {
        saveJSON(STORAGE_KEYS.leads, DEFAULT_LEADS);
        return [...DEFAULT_LEADS];
    }
    return stored;
}

function setLeads(leads) {
    saveJSON(STORAGE_KEYS.leads, leads);
}

function initLeadsAndCRM() {
    const tbody = document.getElementById("leads-tbody");
    const board = document.getElementById("crm-board");
    if (!tbody && !board) return;

    let leads = getLeads();
    let editingId = null;

    const form = document.getElementById("lead-form");
    const search = document.getElementById("leads-search");
    const empty = document.getElementById("leads-empty");

    const renderLeads = () => {
        if (!tbody) return;
        const q = (search?.value || "").trim().toLowerCase();
        const filtered = leads.filter((l) => {
            if (!q) return true;
            return [l.name, l.email, l.company, CRM_LABELS[l.stage]]
                .join(" ")
                .toLowerCase()
                .includes(q);
        });

        tbody.innerHTML = "";
        if (empty) empty.hidden = filtered.length > 0;

        filtered.forEach((lead) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${escapeHtml(lead.name)}</td>
                <td>${escapeHtml(lead.email)}</td>
                <td>${escapeHtml(lead.company || "—")}</td>
                <td><span class="stage-pill stage-${lead.stage}">${CRM_LABELS[lead.stage]}</span></td>
                <td class="lead-actions">
                    <button type="button" class="btn-link" data-edit="${lead.id}">Edit</button>
                    <button type="button" class="btn-link danger" data-delete="${lead.id}">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderCRM = () => {
        if (!board) return;
        CRM_STAGES.forEach((stage) => {
            const zone = board.querySelector(`[data-dropzone="${stage}"]`);
            const count = board.querySelector(`[data-stage="${stage}"] [data-count]`);
            if (!zone) return;
            zone.innerHTML = "";
            const stageLeads = leads.filter((l) => l.stage === stage);
            if (count) count.textContent = String(stageLeads.length);

            if (!stageLeads.length) {
                const emptyEl = document.createElement("p");
                emptyEl.className = "crm-empty";
                emptyEl.textContent = "No leads";
                zone.appendChild(emptyEl);
                return;
            }

            stageLeads.forEach((lead) => {
                const card = document.createElement("div");
                card.className = "crm-card";
                card.draggable = true;
                card.dataset.id = String(lead.id);
                card.setAttribute("tabindex", "0");
                card.setAttribute("role", "button");
                card.setAttribute("aria-label", `${lead.name}, ${CRM_LABELS[lead.stage]}. Press Enter to move stage.`);
                card.innerHTML = `
                    <strong>${escapeHtml(lead.name)}</strong>
                    <span>${escapeHtml(lead.company || lead.email)}</span>
                    <div class="crm-card-actions">
                        <label class="sr-only" for="move-${lead.id}">Move ${escapeHtml(lead.name)}</label>
                        <select id="move-${lead.id}" data-move="${lead.id}" aria-label="Move ${escapeHtml(lead.name)} to stage">
                            ${CRM_STAGES.map((s) => `<option value="${s}" ${s === lead.stage ? "selected" : ""}>${CRM_LABELS[s]}</option>`).join("")}
                        </select>
                    </div>
                `;

                card.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", String(lead.id));
                    e.dataTransfer.effectAllowed = "move";
                    card.classList.add("dragging");
                });
                card.addEventListener("dragend", () => card.classList.remove("dragging"));

                card.addEventListener("keydown", (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    const idx = CRM_STAGES.indexOf(lead.stage);
                    const next = CRM_STAGES[(idx + 1) % CRM_STAGES.length];
                    moveLead(lead.id, next);
                });

                zone.appendChild(card);
            });
        });
    };

    const moveLead = (id, stage) => {
        const lead = leads.find((l) => String(l.id) === String(id));
        if (!lead || !CRM_STAGES.includes(stage) || lead.stage === stage) return;
        lead.stage = stage;
        setLeads(leads);
        renderLeads();
        renderCRM();
        showToast(`Moved to ${CRM_LABELS[stage]}`);
    };

    board?.querySelectorAll("[data-dropzone]").forEach((zone) => {
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
        zone.addEventListener("drop", (e) => {
            e.preventDefault();
            zone.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain");
            moveLead(id, zone.dataset.dropzone);
        });
    });

    board?.addEventListener("change", (e) => {
        const select = e.target.closest("[data-move]");
        if (!select) return;
        moveLead(select.dataset.move, select.value);
    });

    tbody?.addEventListener("click", (e) => {
        const editBtn = e.target.closest("[data-edit]");
        const deleteBtn = e.target.closest("[data-delete]");
        if (editBtn) {
            const lead = leads.find((l) => String(l.id) === editBtn.dataset.edit);
            if (!lead || !form) return;
            editingId = lead.id;
            form.hidden = false;
            document.getElementById("lead-id").value = String(lead.id);
            document.getElementById("lead-name").value = lead.name;
            document.getElementById("lead-email").value = lead.email;
            document.getElementById("lead-company").value = lead.company || "";
            document.getElementById("lead-stage").value = lead.stage;
            document.getElementById("lead-name")?.focus();
        }
        if (deleteBtn) {
            const id = deleteBtn.dataset.delete;
            leads = leads.filter((l) => String(l.id) !== String(id));
            setLeads(leads);
            renderLeads();
            renderCRM();
            showToast("Lead deleted", "info");
        }
    });

    document.getElementById("lead-add-btn")?.addEventListener("click", () => {
        editingId = null;
        form.hidden = false;
        form.reset();
        document.getElementById("lead-id").value = "";
        document.getElementById("lead-stage").value = "new";
        document.getElementById("lead-name")?.focus();
    });

    document.getElementById("lead-cancel-btn")?.addEventListener("click", () => {
        form.hidden = true;
        form.reset();
        editingId = null;
    });

    search?.addEventListener("input", renderLeads);

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nameEl = document.getElementById("lead-name");
        const emailEl = document.getElementById("lead-email");
        const companyEl = document.getElementById("lead-company");
        const stageEl = document.getElementById("lead-stage");
        const saveBtn = document.getElementById("lead-save-btn");
        let valid = true;

        const nameVal = (nameEl?.value || "").trim();
        const emailVal = (emailEl?.value || "").trim();

        if (nameVal.length < 2) {
            showError("lead-name-error");
            nameEl?.classList.add("invalid");
            valid = false;
        } else {
            hideError("lead-name-error");
            nameEl?.classList.remove("invalid");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            showError("lead-email-error");
            emailEl?.classList.add("invalid");
            valid = false;
        } else {
            hideError("lead-email-error");
            emailEl?.classList.remove("invalid");
        }

        if (!valid) {
            showToast("Fix lead form errors.", "error");
            return;
        }

        setButtonLoading(saveBtn, true);
        await delay(500);

        const isEdit = Boolean(editingId);
        const payload = {
            id: editingId || Date.now(),
            name: nameVal,
            email: emailVal,
            company: (companyEl?.value || "").trim(),
            stage: stageEl?.value || "new"
        };

        if (isEdit) {
            leads = leads.map((l) => (String(l.id) === String(editingId) ? payload : l));
        } else {
            leads.push(payload);
        }

        setLeads(leads);
        setButtonLoading(saveBtn, false);
        form.hidden = true;
        form.reset();
        editingId = null;
        renderLeads();
        renderCRM();
        showToast(isEdit ? "Lead updated" : "Lead added");
    });

    window.refreshCRM = () => {
        leads = getLeads();
        renderLeads();
        renderCRM();
    };

    renderLeads();
    renderCRM();
}

/* ---------- Settings ---------- */

function initSettings() {
    const form = document.getElementById("settings-form");
    if (!form) return;

    const session = window.AlphaAuth?.getSession?.();
    const saved = loadJSON(STORAGE_KEYS.settings, null);
    if (saved) {
        if (saved.name) form.querySelector("#settings-name").value = saved.name;
        if (saved.email) form.querySelector("#settings-email").value = saved.email;
        if (saved.timezone) form.querySelector("#settings-timezone").value = saved.timezone;
        form.querySelector("#notifications").checked = Boolean(saved.notifications);
        form.querySelector("#ai-suggestions").checked = Boolean(saved.aiSuggestions);
        updateProfileName(saved.name);
    } else if (session) {
        if (session.name) form.querySelector("#settings-name").value = session.name;
        if (session.email) form.querySelector("#settings-email").value = session.email;
        updateProfileName(session.name);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = form.querySelector("#settings-email");
        const name = form.querySelector("#settings-name");
        const password = form.querySelector("#settings-password");
        const confirm = form.querySelector("#settings-password-confirm");
        const emailError = document.getElementById("email-error");
        const passwordError = document.getElementById("password-error");
        const confirmError = document.getElementById("password-confirm-error");
        const success = document.getElementById("settings-success");
        const submit = document.getElementById("settings-submit");

        success.hidden = true;
        let valid = true;
        const emailVal = (email?.value || "").trim();
        const passVal = password?.value || "";
        const confirmVal = confirm?.value || "";

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            if (emailError) emailError.hidden = false;
            email?.classList.add("invalid");
            valid = false;
        } else {
            if (emailError) emailError.hidden = true;
            email?.classList.remove("invalid");
        }

        if (passVal || confirmVal) {
            if (passVal.length < 8) {
                if (passwordError) passwordError.hidden = false;
                password?.classList.add("invalid");
                valid = false;
            } else {
                if (passwordError) passwordError.hidden = true;
                password?.classList.remove("invalid");
            }
            if (passVal !== confirmVal) {
                if (confirmError) confirmError.hidden = false;
                confirm?.classList.add("invalid");
                valid = false;
            } else {
                if (confirmError) confirmError.hidden = true;
                confirm?.classList.remove("invalid");
            }
        } else {
            if (passwordError) passwordError.hidden = true;
            if (confirmError) confirmError.hidden = true;
            password?.classList.remove("invalid");
            confirm?.classList.remove("invalid");
        }

        if (!valid) {
            showToast("Please fix settings validation errors.", "error");
            return;
        }

        setButtonLoading(submit, true);
        await delay(800);

        const payload = {
            name: (name?.value || "").trim() || "User",
            email: emailVal,
            timezone: form.querySelector("#settings-timezone")?.value,
            notifications: form.querySelector("#notifications")?.checked,
            aiSuggestions: form.querySelector("#ai-suggestions")?.checked,
            passwordUpdated: Boolean(passVal)
        };

        if (window.AlphaAuth?.updateAccount) {
            const authResult = AlphaAuth.updateAccount({
                name: payload.name,
                email: payload.email,
                password: passVal || undefined
            });
            if (!authResult.ok) {
                setButtonLoading(submit, false);
                showToast(authResult.error || "Could not update account.", "error");
                return;
            }
            if (authResult.user?.email) {
                payload.email = authResult.user.email;
                if (email) email.value = authResult.user.email;
            }
        }

        saveJSON(STORAGE_KEYS.settings, payload);
        updateProfileName(payload.name);

        if (passVal) {
            password.value = "";
            confirm.value = "";
        }

        setButtonLoading(submit, false);
        success.hidden = false;
        const isDemo = (payload.email || "").toLowerCase() === "demo@projectalpha.ai";
        if (passVal && isDemo) {
            showToast("Settings saved. Demo password stays demo1234 for investor logins.");
        } else {
            showToast(passVal ? "Settings & password saved" : "Settings saved");
        }
        setTimeout(() => {
            success.hidden = true;
        }, 3000);
    });
}

function updateProfileName(name) {
    const profile = document.getElementById("user-greeting") || document.querySelector(".user-profile span");
    const img = document.getElementById("user-avatar") || document.querySelector(".user-profile img");
    if (profile && name) profile.textContent = `Welcome, ${name.split(" ")[0]}!`;
    if (img && name) {
        img.alt = `${name} avatar`;
    }
}
