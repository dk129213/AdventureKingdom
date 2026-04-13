/* =============================================
   Adventure Kingdom - Dynamic Gallery Loader
   Loads admin-uploaded images from /api/gallery
   Falls back to hardcoded images if API fails
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
    })
    .catch(() => {
      // Silently keep default images on error
    });

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
