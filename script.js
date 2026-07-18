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

  if (!sessionStorage.getItem('alpha-splash-seen')) {
    const loader = document.createElement('div');
    loader.className = 'site-loader';
    loader.classList.toggle('is-alpha-splash', document.body.classList.contains('home-page'));
    loader.innerHTML = document.body.classList.contains('home-page')
      ? '<div class="splash-alpha-mark" aria-hidden="true"><span class="splash-alpha-ring"></span><span class="splash-alpha-ring"></span><span class="splash-alpha-ring"></span><strong>A</strong></div><div class="splash-wordmark"><strong>PROJECT ALPHA</strong><span>Intelligence, orchestrated</span></div><div class="splash-line" aria-hidden="true"><i></i></div>'
      : '<div class="splash-orbit" aria-hidden="true"><span></span><span></span><span></span><div class="loader-mark"><i class="fas fa-wave-square"></i></div></div><div class="splash-wordmark"><strong>PROJECT ALPHA</strong><span>Initializing intelligence</span></div><div class="splash-line" aria-hidden="true"><i></i></div>';
    loader.setAttribute('aria-hidden', 'true');
    document.body.prepend(loader);
    const dismissLoader = () => {
      loader.classList.add('is-hidden');
      sessionStorage.setItem('alpha-splash-seen', 'true');
      window.setTimeout(() => loader.remove(), 750);
    };
    window.addEventListener('load', dismissLoader, { once: true });
    window.setTimeout(dismissLoader, reduceMotion ? 150 : 1450);
  }

  root.dataset.theme = 'dark';

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

  // Homepage-only depth follows precise pointers and updates at most once per frame.
  const commandVisual = document.querySelector('.home-page .hero-visual');
  const commandCenter = commandVisual?.querySelector('.command-center');
  if (commandVisual && commandCenter && !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let depthFrame = 0;
    const updateDepth = (event) => {
      if (depthFrame) return;
      depthFrame = window.requestAnimationFrame(() => {
        const bounds = commandVisual.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        commandCenter.style.setProperty('--depth-x', `${((x - .5) * 4).toFixed(2)}deg`);
        commandCenter.style.setProperty('--depth-y', `${((.5 - y) * 3).toFixed(2)}deg`);
        commandCenter.style.setProperty('--light-x', `${(x * 100).toFixed(1)}%`);
        commandCenter.style.setProperty('--light-y', `${(y * 100).toFixed(1)}%`);
        depthFrame = 0;
      });
    };
    commandVisual.addEventListener('pointermove', updateDepth, { passive: true });
    commandVisual.addEventListener('pointerleave', () => {
      if (depthFrame) window.cancelAnimationFrame(depthFrame);
      depthFrame = 0;
      commandCenter.style.removeProperty('--depth-x');
      commandCenter.style.removeProperty('--depth-y');
      commandCenter.style.removeProperty('--light-x');
      commandCenter.style.removeProperty('--light-y');
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
    if (form.dataset.submitting === 'true') return;
    const status = form.querySelector('.form-status');
    const submit = form.querySelector('[type="submit"]');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const endpoint = form.getAttribute('action') || '';
    form.dataset.submitting = 'true';
    if (submit) { submit.disabled = true; submit.setAttribute('aria-disabled', 'true'); submit.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending'; }
    try {
      const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      form.reset();
      if (status) { status.textContent = 'Thank you. Your enquiry was sent successfully, and we will be in touch shortly.'; status.className = 'form-status success'; }
    } catch {
      if (status) { status.textContent = 'Your enquiry could not be sent. Please try again or email hello@projectalpha.ai.'; status.className = 'form-status error'; }
    } finally {
      form.dataset.submitting = 'false';
      if (submit) { submit.disabled = false; submit.removeAttribute('aria-disabled'); submit.innerHTML = 'Send enquiry <i class="fas fa-arrow-right"></i>'; }
    }
  }));

  document.querySelectorAll('[data-year]').forEach((item) => { item.textContent = new Date().getFullYear(); });

  // GSAP is an optional homepage enhancement; CSS remains the complete fallback.
  if (document.body.classList.contains('home-page') && window.gsap && !reduceMotion) {
    const gsap = window.gsap;
    const splashWasSeen = sessionStorage.getItem('alpha-splash-seen') === 'true';
    document.querySelectorAll('.command-hero .reveal').forEach((item) => item.classList.add('visible'));

    gsap.timeline({ delay: splashWasSeen ? .08 : 1.05, defaults: { ease: 'power3.out' } })
      .fromTo('.command-hero .eyebrow', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .55 })
      .fromTo('.command-hero h1', { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .9 }, '-=.28')
      .fromTo('.command-hero .hero-copy > p', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .7 }, '-=.55')
      .fromTo('.command-hero .hero-actions, .command-hero .hero-trust', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .65, stagger: .1 }, '-=.42')
      .fromTo('.command-center', { autoAlpha: 0, scale: .965, y: 24 }, { autoAlpha: 1, scale: 1, y: 0, duration: 1.05 }, '-=.9')
      .fromTo('.command-center .command-node, .command-center .signal-card, .command-center .approval-card', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .5, stagger: .07 }, '-=.42')
      .fromTo('.command-float', { autoAlpha: 0, scale: .92 }, { autoAlpha: 1, scale: 1, duration: .5, stagger: .12 }, '-=.25');

    gsap.to('.alpha-core-shell', { y: -3, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.alpha-atmosphere span', {
      y: 'random(-18, 18)', x: 'random(-10, 10)', opacity: 'random(.18, .65)',
      duration: 'random(3.5, 6.5)', repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: .15
    });
  }
});
