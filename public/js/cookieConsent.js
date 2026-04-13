/* =============================================
   Adventure Kingdom - GDPR Cookie Consent
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ak_consent_answered')) return;

  const lang = document.documentElement.getAttribute('data-lang') || 'hr';

  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.innerHTML = `
    <div class="cookie-inner">
      <p data-hr>Koristimo lokalno spremanje podataka (localStorage) kako bismo zapamtili vasu email adresu za buducu rezervaciju. Nikakvi kolacici se ne salju trecim stranama.</p>
      <p data-en>We use local storage (localStorage) to remember your email for future reservations. No cookies are sent to third parties.</p>
      <div class="cookie-buttons">
        <button id="cookieAccept" class="cookie-btn accept">
          <span data-hr>Prihvacam</span><span data-en>Accept</span>
        </button>
        <button id="cookieDecline" class="cookie-btn decline">
          <span data-hr>Odbijam</span><span data-en>Decline</span>
        </button>
      </div>
    </div>
  `;

  // Apply current language visibility
  const currentLang = document.documentElement.getAttribute('data-lang') || 'hr';
  if (currentLang === 'en') {
    banner.querySelectorAll('[data-hr]').forEach(el => el.style.display = 'none');
    banner.querySelectorAll('[data-en]').forEach(el => el.style.display = '');
  } else {
    banner.querySelectorAll('[data-en]').forEach(el => el.style.display = 'none');
  }

  document.body.appendChild(banner);

  document.getElementById('cookieAccept').addEventListener('click', () => {
    localStorage.setItem('ak_consent', 'true');
    localStorage.setItem('ak_consent_answered', 'true');
    banner.classList.add('cookie-hidden');
    setTimeout(() => banner.remove(), 400);
  });

  document.getElementById('cookieDecline').addEventListener('click', () => {
    localStorage.setItem('ak_consent', 'false');
    localStorage.setItem('ak_consent_answered', 'true');
    localStorage.removeItem('ak_customer_email');
    banner.classList.add('cookie-hidden');
    setTimeout(() => banner.remove(), 400);
  });
});
