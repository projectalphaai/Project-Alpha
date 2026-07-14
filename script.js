document.addEventListener("DOMContentLoaded", () => {
  const navMenu = document.querySelector(".glassmorphism-nav ul");

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (window.innerWidth <= 768 && navMenu) {
        navMenu.classList.remove("active");
      }
    });
  });

  const fadeInElements = document.querySelectorAll(".fade-in");

  const appearOnScroll = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("appear");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );

  fadeInElements.forEach((el) => {
    appearOnScroll.observe(el);
  });

  const counters = document.querySelectorAll(".stat-number");
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const element = entry.target;
        const target = Number(element.dataset.target || 0);
        const suffix = element.textContent.includes("%") ? "%" : "";
        const duration = 1400;
        const startTime = performance.now();

        const updateCounter = (now) => {
          const progress = Math.min(1, (now - startTime) / duration);
          const value = Math.floor(progress * target);
          element.textContent = `${value}${suffix}`;

          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            element.textContent = `${target}${suffix}`;
          }
        };

        requestAnimationFrame(updateCounter);
        observer.unobserve(element);
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach((counter) => counterObserver.observe(counter));

  const navToggle = document.querySelector(".nav-toggle");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }

  document.querySelectorAll(".faq-item").forEach((item) => {
    const button = item.querySelector(".faq-question");
    if (!button) return;

    button.addEventListener("click", () => {
      document.querySelectorAll(".faq-item").forEach((faq) => {
        if (faq !== item) {
          faq.classList.remove("active");
        }
      });
      item.classList.toggle("active");
    });
  });
});

