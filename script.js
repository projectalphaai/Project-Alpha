document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.querySelector('.navbar');
  const toggle = document.querySelector('.nav-toggle');
  const panel = document.querySelector('.nav-panel');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  panel?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  let ticking = false;
  const updateNavbar = () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 16);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  }, { passive: true });
  updateNavbar();

  const revealItems = document.querySelectorAll('.reveal');
  revealItems.forEach((item, index) => {
    item.dataset.aos = 'fade-up';
    item.dataset.aosDuration = '700';
    item.dataset.aosDelay = String(Math.min((index % 4) * 60, 180));
  });

  if (reduceMotion) {
    revealItems.forEach((item) => item.classList.add('visible'));
  } else {
    const aosStyles = document.createElement('link');
    aosStyles.rel = 'stylesheet';
    aosStyles.href = 'https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css';
    document.head.appendChild(aosStyles);

    const aosScript = document.createElement('script');
    aosScript.src = 'https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js';
    aosScript.defer = true;
    aosScript.onload = () => window.AOS?.init({ once: true, offset: 48, duration: 700, easing: 'ease-out-cubic' });
    aosScript.onerror = () => revealItems.forEach((item) => item.classList.add('visible'));
    document.body.appendChild(aosScript);
    window.setTimeout(() => {
      if (!window.AOS) revealItems.forEach((item) => item.classList.add('visible'));
    }, 3000);
  }

  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('.faq-question');
    button?.addEventListener('click', () => {
      const willOpen = !item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((faq) => {
        faq.classList.remove('active');
        faq.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

  document.querySelectorAll('.contact-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.form-status');
      const submit = form.querySelector('[type="submit"]');
      if (!form.checkValidity()) {
        form.reportValidity();
        if (status) {
          status.textContent = 'Please complete the required fields.';
          status.className = 'form-status error';
        }
        return;
      }

      const endpoint = form.getAttribute('action') || '';
      if (endpoint.includes('YOUR_FORM_ID')) {
        if (status) {
          status.textContent = 'Formspree setup required: replace YOUR_FORM_ID in contact.html before launch.';
          status.className = 'form-status error';
        }
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending';
      }
      try {
        const response = await fetch(endpoint, {
          method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('Form submission failed');
        form.reset();
        if (status) {
          status.textContent = 'Thanks - your enquiry has been sent. We will be in touch shortly.';
          status.className = 'form-status success';
        }
      } catch {
        if (status) {
          status.textContent = 'We could not send your message. Please email hello@projectalpha.ai.';
          status.className = 'form-status error';
        }
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.innerHTML = 'Send enquiry <i class="fas fa-arrow-right"></i>';
        }
      }
    });
  });

  document.querySelectorAll('[data-year]').forEach((item) => { item.textContent = new Date().getFullYear(); });
});
