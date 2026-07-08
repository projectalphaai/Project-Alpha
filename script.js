document.addEventListener("DOMContentLoaded", () => {
  // Smooth scrolling for navigation links
  document.querySelectorAll(".glassmorphism-nav ul li a").forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth" });
      }
      // Close mobile nav after clicking a link
      if (window.innerWidth <= 768) {
        navMenu.classList.remove("active");
      }
    });
  });

  // Intersection Observer for scroll animations
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

  // Mobile navigation toggle
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.querySelector(".glassmorphism-nav ul");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }
});
 
