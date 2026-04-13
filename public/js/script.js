/* =============================================
   Adventure Kingdom - Main JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('navbar');
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const floatingBtn = document.getElementById('floatingBtn');
    const langToggle = document.getElementById('langToggle');

    // --- Language Switcher ---
    let currentLang = localStorage.getItem('ak-lang') || 'hr';
    setLanguage(currentLang);

    function setLanguage(lang) {
        currentLang = lang;
        document.documentElement.setAttribute('data-lang', lang);
        document.documentElement.setAttribute('lang', lang);
        localStorage.setItem('ak-lang', lang);
    }

    if (langToggle) {
        langToggle.addEventListener('click', () => {
            setLanguage(currentLang === 'hr' ? 'en' : 'hr');
        });
    }

    // --- Mobile Menu ---
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    function closeMenu() {
        if (hamburger) hamburger.classList.remove('active');
        if (navLinks) navLinks.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        });
    }

    overlay.addEventListener('click', closeMenu);
    if (navLinks) navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

    // --- Navbar scroll effect ---
    if (navbar && !navbar.classList.contains('scrolled')) {
        function handleScroll() {
            const scrollY = window.scrollY;
            navbar.classList.toggle('scrolled', scrollY > 50);
            if (floatingBtn) {
                floatingBtn.classList.toggle('visible', scrollY > 500);
            }
        }
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    }

    // --- Scroll animations (Intersection Observer) ---
    const animateElements = document.querySelectorAll('[data-animate]');
    if (animateElements.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    observer.unobserve(entry.target);
                }
            });
        }, { root: null, rootMargin: '0px 0px -40px 0px', threshold: 0.1 });
        animateElements.forEach(el => observer.observe(el));
    }

    // --- Smooth scroll (single delegated listener) ---
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });

    // --- Close menu on Escape ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    // --- Reservation page: Quantity buttons ---
    document.querySelectorAll('.addon-qty').forEach(qtyWrap => {
        const minus = qtyWrap.querySelector('.qty-minus');
        const plus = qtyWrap.querySelector('.qty-plus');
        const display = qtyWrap.querySelector('.qty-value');

        minus.addEventListener('click', () => {
            let val = parseInt(display.textContent);
            if (val > 0) display.textContent = val - 1;
        });

        plus.addEventListener('click', () => {
            let val = parseInt(display.textContent);
            display.textContent = val + 1;
        });
    });

    // --- Load Events on Homepage ---
    const eventsGrid = document.getElementById('eventsGrid');
    if (eventsGrid) {
        loadEvents();
    }

    async function loadEvents() {
        try {
            const res = await fetch('/api/events');
            const data = await res.json();

            if (!data.success || !data.data.length) {
                const lang = document.documentElement.getAttribute('data-lang') || 'hr';
                eventsGrid.innerHTML = `<div class="no-events">
                    <p data-hr>Trenutno nema nadolazecih dogadanja. Pratite nas na Instagramu!</p>
                    <p data-en>No upcoming events at the moment. Follow us on Instagram!</p>
                </div>`;
                // Re-apply language visibility
                if (lang === 'en') {
                    eventsGrid.querySelectorAll('[data-hr]').forEach(el => el.style.display = 'none');
                    eventsGrid.querySelectorAll('[data-en]').forEach(el => el.style.display = '');
                }
                return;
            }

            const months_hr = ['Sij','Velj','Ozu','Tra','Svi','Lip','Srp','Kol','Ruj','Lis','Stu','Pro'];
            const months_en = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

            eventsGrid.innerHTML = data.data.map(event => {
                const d = new Date(event.event_date + 'T00:00:00');
                const day = d.getDate();
                const monthHr = months_hr[d.getMonth()];
                const monthEn = months_en[d.getMonth()];

                return `
                    <div class="event-card">
                        <div class="event-date-badge">
                            <span class="event-day">${day}</span>
                            <span class="event-month" data-hr>${monthHr}</span>
                            <span class="event-month" data-en>${monthEn}</span>
                        </div>
                        <h3 data-hr>${escapeHtml(event.title_hr)}</h3>
                        <h3 data-en>${escapeHtml(event.title_en)}</h3>
                        ${event.description_hr ? `<p data-hr>${escapeHtml(event.description_hr)}</p>` : ''}
                        ${event.description_en ? `<p data-en>${escapeHtml(event.description_en)}</p>` : ''}
                        ${event.event_time ? `<div class="event-time">&#x1F570; ${escapeHtml(event.event_time)}</div>` : ''}
                    </div>
                `;
            }).join('');

            // Apply current language
            const lang = document.documentElement.getAttribute('data-lang') || 'hr';
            if (lang === 'en') {
                eventsGrid.querySelectorAll('[data-hr]').forEach(el => el.style.display = 'none');
                eventsGrid.querySelectorAll('[data-en]').forEach(el => el.style.display = '');
            }
        } catch (err) {
            console.error('Failed to load events:', err);
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
