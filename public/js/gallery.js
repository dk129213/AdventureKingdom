/* =============================================
   Adventure Kingdom - Dynamic Gallery Loader
   Loads admin-uploaded images from /api/gallery
   Falls back to hardcoded images if API fails
   + Lightbox (click to enlarge)
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;

  fetch('/api/gallery')
    .then(res => res.json())
    .then(data => {
      if (!data.success || !data.data || data.data.length === 0) return;

      // Admin has uploaded photos — replace the default grid
      grid.innerHTML = data.data.map(img => {
        const hrLabel = img.label_hr ? `<span class="gallery-label" data-hr>${escHtml(img.label_hr)}</span>` : '';
        const enLabel = img.label_en ? `<span class="gallery-label" data-en>${escHtml(img.label_en)}</span>` : '';
        return `
          <div class="gallery-item" data-animate>
            <div class="gallery-card">
              <img src="/gallery-images/${encodeURIComponent(img.filename)}" alt="${escAttr(img.label_en || img.label_hr || 'Gallery')}" loading="lazy">
              ${hrLabel}
              ${enLabel}
            </div>
          </div>
        `;
      }).join('');

      // Re-apply language visibility
      const lang = document.documentElement.getAttribute('data-lang') || 'hr';
      grid.querySelectorAll('[data-hr]').forEach(el => el.style.display = lang === 'hr' ? '' : 'none');
      grid.querySelectorAll('[data-en]').forEach(el => el.style.display = lang === 'en' ? '' : 'none');

      // Re-init lightbox for new images
      initLightbox();
    })
    .catch(() => {
      // Silently keep default images on error
    });

  // --- Lightbox (click to enlarge) ---
  initLightbox();

  function initLightbox() {
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach(card => {
      // Avoid double-binding
      if (card.dataset.lightboxBound) return;
      card.dataset.lightboxBound = '1';

      card.addEventListener('click', () => {
        const img = card.querySelector('img');
        if (!img) return;
        openLightbox(img.src, img.alt);
      });
    });
  }

  function openLightbox(src, alt) {
    const overlay = document.createElement('div');
    overlay.className = 'gallery-lightbox';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'gallery-lightbox-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || 'Gallery image';

    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    function close() {
      overlay.remove();
      document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handler);
      }
    });
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
