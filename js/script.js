document.addEventListener("DOMContentLoaded", () => {
    initLoadingScreen();
    initSmoothScroll();
    initMobileNav();
    initHeaderScroll();
    initHeroEntrance();
    initParticleCanvas();
    initMockupParallax();
    initSectionParallax();
    initStatsCounter();
    initScrollReveal();
    initCustomCursor();
    initTiltCards();
    initPricingToggle();
    initChatbotTyping();
    initAuroraMouse();
    initContactForm();
});

/* Loading screen fade out */
function initLoadingScreen() {
    const loader = document.getElementById("loading-screen");
    if (!loader) return;

    document.body.classList.add("loading");

    const hide = () => {
        loader.classList.add("hidden");
        document.body.classList.remove("loading");
        loader.setAttribute("aria-hidden", "true");
    };

    if (document.readyState === "complete") {
        setTimeout(hide, 1800);
    } else {
        window.addEventListener("load", () => setTimeout(hide, 1800));
    }
}

/* Smooth scrolling for anchor links */
function initSmoothScroll() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener("click", function (e) {
            const targetId = this.getAttribute("href");
            if (targetId === "#" || targetId.length <= 1) return;

            const target = document.querySelector(targetId);
            if (!target) return;

            e.preventDefault();
            const headerOffset = 72;
            const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
            window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });

            closeMobileNav();
        });
    });
}

function closeMobileNav() {
    const navLinks = document.querySelector(".nav-links");
    const navToggle = document.querySelector(".nav-toggle");
    if (navLinks?.classList.contains("open")) {
        navLinks.classList.remove("open");
        navToggle?.classList.remove("active");
        navToggle?.setAttribute("aria-expanded", "false");
    }
}

/* Mobile navigation toggle */
function initMobileNav() {
    const navToggle = document.querySelector(".nav-toggle");
    const navLinks = document.querySelector(".nav-links");

    if (!navToggle || !navLinks) return;

    navToggle.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("open");
        navToggle.classList.toggle("active", isOpen);
        navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", (e) => {
        if (!navLinks.classList.contains("open")) return;
        if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
            closeMobileNav();
        }
    });
}

/* Sticky header scroll effect */
function initHeaderScroll() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    const onScroll = () => {
        header.classList.toggle("scrolled", window.scrollY > 20);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
}

/* Hero entrance animations on load */
function initHeroEntrance() {
    const heroContent = document.querySelector(".hero-content");
    const heroMockup = document.querySelector(".hero-dashboard-mockup");

    [heroContent, heroMockup].forEach((el, i) => {
        if (!el) return;
        el.classList.add("hero-enter");
        requestAnimationFrame(() => {
            setTimeout(() => el.classList.add("hero-enter-active"), 100 + i * 150);
        });
    });
}

/* Floating particle canvas — performant rAF loop */
function initParticleCanvas() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let particles = [];
    let animationId;
    let width = 0;
    let height = 0;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    function resize() {
        const hero = canvas.closest(".hero");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = hero ? hero.offsetWidth : window.innerWidth;
        height = hero ? hero.offsetHeight : window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticles(count) {
        particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 2 + 0.5,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                opacity: Math.random() * 0.4 + 0.15,
                glow: Math.random() > 0.7,
            });
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

            if (p.glow) {
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
                grad.addColorStop(0, `rgba(139, 92, 246, ${p.opacity})`);
                grad.addColorStop(1, "rgba(139, 92, 246, 0)");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(196, 181, 253, ${p.opacity + 0.2})`;
                ctx.fill();
            } else {
                ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
                ctx.fill();
            }

            for (let j = i + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 100) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(139, 92, 246, ${0.06 * (1 - dist / 100)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        });

        animationId = requestAnimationFrame(draw);
    }

    resize();
    const count = prefersReducedMotion ? 25 : isTouch ? 40 : 70;
    createParticles(count);

    if (!prefersReducedMotion) {
        draw();
    } else {
        draw();
        cancelAnimationFrame(animationId);
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resize();
            createParticles(count);
        }, 150);
    });
}

/* 3D mockup parallax on mouse move */
function initMockupParallax() {
    const mockup = document.querySelector("[data-parallax]");
    const hero = document.querySelector(".hero");
    if (!mockup || !hero) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (prefersReducedMotion || isTouch) return;

    let rafId = null;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    let isHovering = false;

    hero.addEventListener("mouseenter", () => { isHovering = true; });
    hero.addEventListener("mouseleave", () => {
        isHovering = false;
        targetX = 0;
        targetY = 0;
    });

    hero.addEventListener("mousemove", (e) => {
        const rect = hero.getBoundingClientRect();
        targetX = (e.clientX - rect.left) / rect.width - 0.5;
        targetY = (e.clientY - rect.top) / rect.height - 0.5;
    });

    function animate() {
        if (isHovering) {
            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;

            const rotateY = currentX * 14;
            const rotateX = -currentY * 10;

            mockup.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
        } else {
            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;
            if (Math.abs(currentX) < 0.001 && Math.abs(currentY) < 0.001) {
                mockup.style.transform = "";
            }
        }
        rafId = requestAnimationFrame(animate);
    }

    animate();
}

/* Section parallax layers */
function initSectionParallax() {
    const layers = document.querySelectorAll("[data-parallax-layer]");
    if (!layers.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    let scrollY = 0;
    let ticking = false;

    window.addEventListener("scroll", () => {
        scrollY = window.scrollY;
        if (!ticking) {
            requestAnimationFrame(() => {
                layers.forEach(layer => {
                    const speed = parseFloat(layer.dataset.parallaxLayer) || 0.03;
                    const rect = layer.getBoundingClientRect();
                    const offset = (rect.top + scrollY - window.innerHeight / 2) * speed;
                    layer.style.transform = `translateY(${offset}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

/* Animated stats counter */
function initStatsCounter() {
    const statNumbers = document.querySelectorAll(".stat-number");
    if (!statNumbers.length) return;

    const animateCounter = (el) => {
        if (el.dataset.counted === "true") return;
        el.dataset.counted = "true";

        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || "";
        const duration = 2000;
        const start = performance.now();

        const formatNumber = (n) => (target >= 1000 ? n.toLocaleString() : String(n));

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = formatNumber(Math.floor(eased * target)) + suffix;

            if (progress < 1) requestAnimationFrame(tick);
            else el.textContent = formatNumber(target) + suffix;
        };

        requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.5 }
    );

    statNumbers.forEach(el => observer.observe(el));
}

/* Scroll reveal via IntersectionObserver (single-init guarded) */
let scrollRevealInitialized = false;

function initScrollReveal() {
    if (scrollRevealInitialized) return;
    scrollRevealInitialized = true;

    const revealElements = document.querySelectorAll(".reveal-on-scroll");
    if (!revealElements.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
        revealElements.forEach(el => el.classList.add("revealed"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("revealed");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );

    revealElements.forEach(el => {
        if (el.closest("#hero")) {
            el.classList.add("revealed");
        } else {
            observer.observe(el);
        }
    });
}

/* Custom cursor — desktop only */
function initCustomCursor() {
    const cursor = document.querySelector(".custom-cursor");
    if (!cursor) return;

    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isTouch || prefersReducedMotion) return;

    const dot = cursor.querySelector(".cursor-dot");
    const ring = cursor.querySelector(".cursor-ring");

    document.body.classList.add("custom-cursor-active");

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;

    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.left = mouseX + "px";
        dot.style.top = mouseY + "px";
    });

    function animateRing() {
        ringX += (mouseX - ringX) * 0.15;
        ringY += (mouseY - ringY) * 0.15;
        ring.style.left = ringX + "px";
        ring.style.top = ringY + "px";
        requestAnimationFrame(animateRing);
    }
    animateRing();

    const interactive = "a, button, .btn, [data-tilt], summary, input, .feature-item, .pricing-item";
    document.addEventListener("mouseover", (e) => {
        if (e.target.closest(interactive)) {
            cursor.classList.add("hovering");
        }
    });
    document.addEventListener("mouseout", (e) => {
        if (e.target.closest(interactive)) {
            cursor.classList.remove("hovering");
        }
    });
}

/* Tilt effect on cards */
function initTiltCards() {
    const cards = document.querySelectorAll("[data-tilt]");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    if (prefersReducedMotion || isTouch) return;

    cards.forEach(card => {
        card.addEventListener("mousemove", (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            card.style.transform = `perspective(800px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg) translateY(-4px)`;
            card.style.boxShadow = `${x * -20}px ${y * 20}px 40px rgba(139, 92, 246, 0.15)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "";
            card.style.boxShadow = "";
        });
    });
}

/* Pricing monthly/annual toggle */
function initPricingToggle() {
    const toggle = document.getElementById("pricing-toggle");
    if (!toggle) return;

    const prices = document.querySelectorAll(".price[data-monthly]");
    const labels = document.querySelectorAll(".toggle-label");

    toggle.addEventListener("click", () => {
        const isAnnual = toggle.getAttribute("aria-checked") !== "true";
        toggle.setAttribute("aria-checked", String(isAnnual));

        labels.forEach(label => {
            label.classList.toggle("active", label.dataset.period === (isAnnual ? "annual" : "monthly"));
        });

        prices.forEach(priceEl => {
            const amount = priceEl.querySelector(".amount");
            const period = priceEl.querySelector(".period");
            const monthly = priceEl.dataset.monthly;
            const annual = priceEl.dataset.annual;

            if (isAnnual) {
                amount.textContent = annual;
                period.textContent = "/month";
            } else {
                amount.textContent = monthly;
                period.textContent = "/month";
            }
        });
    });

    labels[0]?.classList.add("active");
}

/* Chatbot demo — intro animation + interactive replies */
function initChatbotTyping() {
    const responseEl = document.getElementById("typing-response");
    const typingMsg = document.querySelector(".typing-message");
    const messages = document.getElementById("chatbot-messages");
    const form = document.getElementById("chatbot-form");
    const input = document.getElementById("chatbot-input");
    if (!responseEl || !messages) return;

    const fullText = "The future is here. Introducing our newest product — crafted to elevate how you create and ship. Pre-order now and be among the first to experience innovation, redefined. #ProductLaunch #Innovation #FutureIsNow";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let busy = false;

    const replyFor = (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("hashtag")) {
            return "Try this mix: #SocialMediaMarketing #ContentCreator #AIAutomation #BrandGrowth #CreatorEconomy — 3 niche tags + 2 reach tags usually performs best.";
        }
        if (q.includes("schedule") || q.includes("when") || q.includes("time")) {
            return "For most B2B audiences, Tue–Thu between 10–11 AM local time wins. Want me to draft three posts and queue them in the dashboard scheduler?";
        }
        if (q.includes("caption") || q.includes("instagram") || q.includes("launch")) {
            return fullText;
        }
        if (q.includes("analytics") || q.includes("engagement")) {
            return "Engagement is strongest on carousels (+22% vs singles in our demo data). Next move: A/B your first 8 words and track saves + profile visits.";
        }
        return `Great prompt. Here's a starter for “${prompt.slice(0, 60)}”: lead with the outcome, add one proof point, end with a clear CTA. Open the dashboard AI Tools to generate full variants.`;
    };

    const appendMessage = (role, text) => {
        const div = document.createElement("div");
        div.className = `chat-message ${role}`;
        const p = document.createElement("p");
        p.textContent = text;
        div.appendChild(p);
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    };

    const runIntro = () => {
        if (prefersReducedMotion) {
            responseEl.textContent = fullText;
            responseEl.classList.add("done");
            if (typingMsg) {
                typingMsg.innerHTML = `<p>${fullText.substring(0, 120)}...</p>`;
                typingMsg.classList.remove("typing-message");
            }
            return;
        }
        setTimeout(() => typeText(responseEl, fullText, typingMsg), 1200);
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    observer.disconnect();
                    runIntro();
                }
            });
        },
        { threshold: 0.3 }
    );

    const section = document.getElementById("chatbot");
    if (section) observer.observe(section);

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const value = (input?.value || "").trim();
        if (!value || busy) return;
        busy = true;
        if (input) input.value = "";

        appendMessage("user", value);
        const thinking = appendMessage("bot", "");
        thinking.classList.add("typing-message");
        thinking.innerHTML = `<div class="typing-indicator" aria-label="AI is typing"><span></span><span></span><span></span></div>`;

        await new Promise((r) => setTimeout(r, prefersReducedMotion ? 200 : 900));
        const reply = replyFor(value);
        thinking.classList.remove("typing-message");
        thinking.innerHTML = "";
        const p = document.createElement("p");
        thinking.appendChild(p);

        responseEl.classList.remove("done");
        if (prefersReducedMotion) {
            p.textContent = reply;
            responseEl.textContent = reply;
            responseEl.classList.add("done");
        } else {
            await typeInto(p, reply, 16);
            responseEl.textContent = reply;
            responseEl.classList.add("done");
        }
        messages.scrollTop = messages.scrollHeight;
        busy = false;
        input?.focus();
    });
}

function typeInto(el, text, speed) {
    return new Promise((resolve) => {
        let i = 0;
        el.textContent = "";
        const tick = () => {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i += 1;
                setTimeout(tick, speed + Math.random() * 12);
            } else {
                resolve();
            }
        };
        tick();
    });
}

function typeText(el, text, typingMsg) {
    let i = 0;
    el.textContent = "";

    function tick() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            setTimeout(tick, 25 + Math.random() * 15);
        } else {
            el.classList.add("done");
            if (typingMsg) {
                typingMsg.innerHTML = `<p>${text.substring(0, 120)}...</p>`;
                typingMsg.classList.remove("typing-message");
            }
        }
    }

    tick();
}

/* Contact form — validate + mock submit to localStorage */
function initContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;

    const name = document.getElementById("contact-name");
    const email = document.getElementById("contact-email");
    const message = document.getElementById("contact-message");
    const submit = document.getElementById("contact-submit");
    const success = document.getElementById("contact-success");
    const errorBanner = document.getElementById("contact-error");

    const showErr = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.hidden = !show;
    };

    const setLoading = (loading) => {
        const spinner = submit?.querySelector(".btn-spinner");
        if (!submit) return;
        submit.disabled = loading;
        submit.classList.toggle("is-loading", loading);
        if (spinner) spinner.hidden = !loading;
    };

    ["contact-name", "contact-email", "contact-message"].forEach((id) => {
        document.getElementById(id)?.addEventListener("input", () => {
            document.getElementById(id)?.classList.remove("invalid");
            showErr(id + "-error", false);
            if (errorBanner) errorBanner.hidden = true;
        });
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (success) success.hidden = true;
        if (errorBanner) errorBanner.hidden = true;

        let valid = true;
        const nameVal = (name?.value || "").trim();
        const emailVal = (email?.value || "").trim();
        const messageVal = (message?.value || "").trim();

        if (nameVal.length < 2) {
            showErr("contact-name-error", true);
            name?.classList.add("invalid");
            valid = false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            showErr("contact-email-error", true);
            email?.classList.add("invalid");
            valid = false;
        }
        if (messageVal.length < 10) {
            showErr("contact-message-error", true);
            message?.classList.add("invalid");
            valid = false;
        }

        if (!valid) return;

        setLoading(true);
        await new Promise((r) => setTimeout(r, 900));

        try {
            const key = "pa_contact_messages";
            const existing = JSON.parse(localStorage.getItem(key) || "[]");
            existing.push({
                id: Date.now(),
                name: nameVal,
                email: emailVal,
                message: messageVal,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem(key, JSON.stringify(existing));
            form.reset();
            if (success) {
                success.hidden = false;
                success.focus?.();
            }
        } catch {
            if (errorBanner) errorBanner.hidden = false;
        } finally {
            setLoading(false);
            if (success && !success.hidden) {
                setTimeout(() => {
                    success.hidden = true;
                }, 5000);
            }
        }
    });
}

/* Aurora subtle mouse interaction — uses CSS vars so keyframes keep running */
function initAuroraMouse() {
    const auroraBg = document.querySelector(".aurora-bg");
    if (!auroraBg) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (prefersReducedMotion || isTouch) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    document.addEventListener("mousemove", (e) => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 40;
        targetY = (e.clientY / window.innerHeight - 0.5) * 30;
    }, { passive: true });

    function animate() {
        currentX += (targetX - currentX) * 0.05;
        currentY += (targetY - currentY) * 0.05;
        auroraBg.style.setProperty("--aurora-mx", `${currentX.toFixed(2)}px`);
        auroraBg.style.setProperty("--aurora-my", `${currentY.toFixed(2)}px`);
        requestAnimationFrame(animate);
    }
    animate();
}
