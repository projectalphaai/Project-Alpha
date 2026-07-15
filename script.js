document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const navbar = document.querySelector('.navbar');
  const toggle = document.querySelector('.nav-toggle');
  const panel = document.querySelector('.nav-panel');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.querySelector('link[rel="canonical"]')) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `https://projectalpha.ai/${location.pathname.split('/').pop() || ''}`;
    document.head.appendChild(canonical);
  }
  if (!document.querySelector('script[type="application/ld+json"]')) {
    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ProfessionalService',
      name: 'Project Alpha AI', url: 'https://projectalpha.ai/',
      description: 'AI automation strategy, agents, workflows, and custom software for ambitious companies.',
      email: 'hello@projectalpha.ai', areaServed: 'Worldwide'
    });
    document.head.appendChild(structuredData);
  }

  // Global experience controls are injected once so every page stays consistent.
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);

  if (!sessionStorage.getItem('alpha-loaded')) {
    const loader = document.createElement('div');
    loader.className = 'site-loader';
    loader.innerHTML = '<div class="loader-mark"><i class="fas fa-sparkles"></i></div><span>Project Alpha AI</span>';
    loader.setAttribute('aria-hidden', 'true');
    document.body.prepend(loader);
    const dismissLoader = () => {
      loader.classList.add('is-hidden');
      sessionStorage.setItem('alpha-loaded', 'true');
      window.setTimeout(() => loader.remove(), 600);
    };
    window.addEventListener('load', dismissLoader, { once: true });
    window.setTimeout(dismissLoader, 900);
  }

  const savedTheme = localStorage.getItem('alpha-theme');
  const preferredLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  root.dataset.theme = savedTheme || (preferredLight ? 'light' : 'dark');
  const themeButton = document.createElement('button');
  themeButton.className = 'theme-toggle';
  themeButton.type = 'button';
  themeButton.setAttribute('aria-label', 'Switch color theme');
  const updateThemeIcon = () => {
    themeButton.innerHTML = root.dataset.theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
  };
  updateThemeIcon();
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('alpha-theme', root.dataset.theme);
    updateThemeIcon();
  });
  navbar?.insertBefore(themeButton, toggle || panel);

  // Surface Phase 2 destinations throughout the existing site without duplicating markup.
  document.querySelectorAll('.footer-col').forEach((column) => {
    const heading = column.querySelector('h3')?.textContent.trim();
    if (heading === 'Company' && !column.querySelector('[href="blog.html"]')) {
      column.insertAdjacentHTML('beforeend', '<a href="blog.html">Insights</a><a href="careers.html">Careers</a>');
    }
  });
  document.querySelectorAll('.site-footer').forEach((footer) => {
    const container = footer.querySelector(':scope > .container');
    if (container && !container.querySelector('.footer-cta')) {
      container.insertAdjacentHTML('afterbegin', '<div class="footer-cta"><div><span class="eyebrow">Build your AI advantage</span><h2>Make the next workflow your smartest one.</h2></div><a class="btn btn-primary" href="contact.html">Start a conversation <i class="fas fa-arrow-right"></i></a></div>');
    }
  });
  document.querySelectorAll('.socials a[href="#"]').forEach((link) => {
    const label = link.getAttribute('aria-label');
    if (label === 'LinkedIn') link.href = 'https://www.linkedin.com/';
    if (label === 'Instagram') link.href = 'https://www.instagram.com/';
    link.target = '_blank';
    link.rel = 'noopener';
  });

  const closeMenu = () => {
    panel?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
  };
  toggle?.addEventListener('click', () => {
    const open = panel?.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(Boolean(open)));
  });
  document.addEventListener('click', (event) => {
    if (panel?.classList.contains('is-open') && !event.target.closest('.navbar')) closeMenu();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  panel?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  let ticking = false;
  const updateScrollUI = () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 16);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { window.requestAnimationFrame(updateScrollUI); ticking = true; }
  }, { passive: true });
  updateScrollUI();

  const revealItems = document.querySelectorAll('.reveal');
  revealItems.forEach((item, index) => { item.dataset.delay = String(index % 4); });
  if (reduceMotion || !('IntersectionObserver' in window)) revealItems.forEach((item) => item.classList.add('visible'));
  else {
    const revealObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }), { rootMargin: '0px 0px -7% 0px', threshold: .08 });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  // Animated counters retain their suffix and run only when first visible.
  const counters = document.querySelectorAll('[data-counter], .stat-card strong');
  const animateCounter = (element) => {
    if (element.dataset.counted) return;
    const original = element.textContent.trim();
    const match = original.match(/([\d.]+)(.*)/);
    if (!match) return;
    element.dataset.counted = 'true';
    const target = Number(match[1]);
    const suffix = match[2];
    const decimals = match[1].includes('.') ? 1 : 0;
    const start = performance.now();
    const duration = 1200;
    const step = (now) => {
      const progressValue = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progressValue, 3);
      element.textContent = `${(target * eased).toFixed(decimals)}${suffix}`;
      if (progressValue < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!reduceMotion) {
    const counterObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
      if (entry.isIntersecting) { animateCounter(entry.target); observer.unobserve(entry.target); }
    }), { threshold: .55 });
    counters.forEach((counter) => counterObserver.observe(counter));
  }

  // Pointer-driven glass tilt is limited to precise pointing devices.
  if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.card, .dashboard').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - .5;
        const y = (event.clientY - box.top) / box.height - .5;
        card.style.setProperty('--rx', `${-y * 4}deg`);
        card.style.setProperty('--ry', `${x * 5}deg`);
      });
      card.addEventListener('pointerleave', () => { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); });
    });
  }

  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('.faq-question');
    button?.addEventListener('click', () => {
      const willOpen = !item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((faq) => {
        faq.classList.remove('active'); faq.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) { item.classList.add('active'); button.setAttribute('aria-expanded', 'true'); }
    });
  });

  document.querySelectorAll('.contact-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('.form-status');
    const submit = form.querySelector('[type="submit"]');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const endpoint = form.getAttribute('action') || '';
    if (endpoint.includes('YOUR_FORM_ID')) {
      if (status) { status.textContent = 'Formspree setup required: replace YOUR_FORM_ID before launch.'; status.className = 'form-status error'; }
      return;
    }
    if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending'; }
    try {
      const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      form.reset();
      if (status) { status.textContent = 'Thanks - your enquiry has been sent.'; status.className = 'form-status success'; }
    } catch {
      if (status) { status.textContent = 'Unable to send. Please email hello@projectalpha.ai.'; status.className = 'form-status error'; }
    } finally {
      if (submit) { submit.disabled = false; submit.innerHTML = 'Send enquiry <i class="fas fa-arrow-right"></i>'; }
    }
  }));

  document.querySelectorAll('[data-year]').forEach((item) => { item.textContent = new Date().getFullYear(); });
});
