document.addEventListener("DOMContentLoaded", () => {
  const navMenu = document.querySelector(".glassmorphism-nav ul");
  const navBar = document.querySelector(".glassmorphism-nav");
  const navLinks = document.querySelectorAll('.glassmorphism-nav a[data-nav-section]');
  const sections = Array.from(document.querySelectorAll('main section[id], section[data-section]'));
  const fadeInElements = document.querySelectorAll(".fade-in");
  const counters = document.querySelectorAll(".stat-number");
  const mouseGlow = document.querySelector('.mouse-glow');
  const navToggle = document.querySelector(".nav-toggle");
  const contactForm = document.querySelector('.contact-form');
  const formStatus = document.querySelector('.form-status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduceMotion && mouseGlow && window.innerWidth > 768) {
    window.addEventListener('pointermove', (event) => {
      mouseGlow.style.opacity = '1';
      mouseGlow.style.transform = `translate(${event.clientX - 140}px, ${event.clientY - 140}px)`;
    });
    window.addEventListener('pointerleave', () => {
      mouseGlow.style.opacity = '0';
    });
  }

  const setActiveNav = () => {
    const scrollPosition = window.scrollY + 140;
    let activeId = 'hero';

    sections.forEach((section) => {
      if (section.offsetTop <= scrollPosition) {
        activeId = section.id || section.dataset.section || 'hero';
      }
    });

    navLinks.forEach((link) => {
      const isActive = link.dataset.navSection === activeId;
      link.classList.toggle('active', isActive);
    });
  };

  const appearOnScroll = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('appear');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  fadeInElements.forEach((el) => appearOnScroll.observe(el));

  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const element = entry.target;
        const rawTarget = element.dataset.target;
        const target = rawTarget !== undefined ? Number(rawTarget) : NaN;
        const suffix = element.dataset.suffix || '';

        if (!Number.isFinite(target)) {
          element.textContent = element.textContent.trim();
          observer.unobserve(element);
          return;
        }

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

  const toggleNav = () => {
    if (navMenu) {
      navMenu.classList.toggle('active');
    }
  };

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', toggleNav);
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
      if (window.innerWidth <= 768 && navMenu) {
        navMenu.classList.remove('active');
      }
    });
  });

  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('.faq-question');
    if (!button) return;

    button.addEventListener('click', () => {
      document.querySelectorAll('.faq-item').forEach((faq) => {
        if (faq !== item) {
          faq.classList.remove('active');
        }
      });
      item.classList.toggle('active');
    });
  });

  const handleScroll = () => {
    if (navBar) {
      navBar.classList.toggle('scrolled', window.scrollY > 16);
    }
    setActiveNav();
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = contactForm.querySelector('#name');
      const email = contactForm.querySelector('#email');
      const message = contactForm.querySelector('#message');
      const button = contactForm.querySelector('button[type="submit"]');

      if (!name || !email || !message) return;

      const isValid = name.value.trim() && email.value.trim() && message.value.trim();
      const validEmail = /.+@.+\..+/.test(email.value.trim());

      if (!isValid || !validEmail) {
        if (formStatus) {
          formStatus.textContent = 'Please complete all fields with a valid email address.';
          formStatus.className = 'form-status error';
        }
        return;
      }

      if (button) {
        button.classList.add('is-loading');
        button.disabled = true;
      }

      if (formStatus) {
        formStatus.textContent = 'Sending your message...';
        formStatus.className = 'form-status loading';
      }

      window.setTimeout(() => {
        if (button) {
          button.classList.remove('is-loading');
          button.disabled = false;
        }
        if (formStatus) {
          formStatus.textContent = 'Thanks — your message is ready to be connected to your real endpoint.';
          formStatus.className = 'form-status success';
        }
        contactForm.reset();
      }, 900);
    });
  }
});

