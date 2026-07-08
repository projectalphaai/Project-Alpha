document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('nav ul li a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Intersection Observer for fade-in animations
    const faders = document.querySelectorAll('.fade-in');

    const appearOptions = {
        threshold: 0.1, // Trigger when 10% of the item is visible
        rootMargin: "0px 0px -50px 0px" // Adjust to trigger slightly before reaching the bottom of the viewport
    };

    const appearOnScroll = new IntersectionObserver(function(entries, appearOnScroll) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            }
            entry.target.classList.add('appear');
            appearOnScroll.unobserve(entry.target);
        });
    }, appearOptions);

    faders.forEach(fader => {
        appearOnScroll.observe(fader);
    });

    // Add .fade-in class to sections for animation
    document.querySelectorAll('section').forEach(section => {
        if (!section.classList.contains('hero') && !section.classList.contains('hero-small')) {
            section.classList.add('fade-in');
        }
    });

    // Counters for AI Stats
    const counters = document.querySelectorAll('.stat-number');
    const speed = 200; // The lower the speed, the faster the counter

    const animateCounter = (counter) => {
        const updateCount = () => {
            const target = +counter.dataset.target;
            const count = +counter.innerText.replace(/[^0-9.]/g, ""); // Remove non-numeric chars but keep dot
            const increment = target / speed;

            if (count < target) {
                counter.innerText = Math.ceil(count + increment) + (target === 99.9 ? "%" : target === 10 ? "x" : "M+");
                setTimeout(updateCount, 1);
            } else {
                counter.innerText = target + (target === 99.9 ? "%" : target === 10 ? "x" : "M+");
            }
        };
        updateCount();
    };

    const counterSection = document.querySelector('#ai-stats');

    const counterObserverOptions = {
        root: null,
        threshold: 0.5,
    };

    const counterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                counters.forEach(animateCounter);
                observer.unobserve(entry.target);
            }
        });
    }, counterObserverOptions);

    if (counterSection) {
        counterObserver.observe(counterSection);
    }

    // Loading Animation (Preloader)
    const preloader = document.createElement('div');
    preloader.id = 'preloader';
    preloader.innerHTML = `
        <div class="loader-content">
            <div class="spinner"></div>
            <div class="loading-text">Loading AI...</div>
        </div>
    `;
    document.body.prepend(preloader);

    window.addEventListener('load', () => {
        preloader.classList.add('hidden');
        setTimeout(() => {
            preloader.remove();
        }, 600);
    });

    // Nav Toggle for mobile
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Close nav menu when a link is clicked (for mobile)
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
        });
    });
});