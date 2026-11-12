// --- Javni cjenik / Public price list ---
//
// Serves the machine-readable price list required by NN 101/2026 (amended by NN 110/2026),
// plus a human-readable page so a customer or an inspector can read the same prices.
//
// Nothing here is rate limited: point VII requires that software tools and automated
// programs be able to fetch prices in real time, and the site-wide limiter would block
// exactly that. Everything served is public, read-only price data.

const express = require('express');
const path = require('path');
const { SERVICES } = require('../priceList');
const { OUTLET, RETENTION_DAYS, buildCsv, listVersions, readVersion, publishIfChanged, current, money } = require('../cjenik');
const { stampAssets } = require('../assetVersion');

const router = express.Router();

const REFERENCE_DATE = '10.9.2026.'; // point II, Odluka o isticanju dodatne cijene

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "20261112-1130" -> "12.11.2026. 11:30" */
function prettyStamp(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(stamp || '');
  if (!m) return stamp || '';
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}. ${m[4]}:${m[5]}`;
}

function noStore(res) {
  // Price data must be current whenever anyone or anything asks for it.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  // The site sends no CORS headers by default, which would stop a browser-based
  // price-comparison tool reading the file. Point VII asks for exactly that to work, and
  // this is public price data, so allow any origin to read it.
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function sendCsv(res, csv, fileName) {
  noStore(res);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  // `inline` so it opens in the browser, but under its compliant file name when saved.
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.send(csv);
}

// --- The current price list, at a stable address for automated collection ---
router.get('/aktualni.csv', (req, res) => {
  const version = publishIfChanged();
  sendCsv(res, readVersion(version.file) ?? buildCsv(), version.file);
});

// --- A specific published version (the 30-day archive) ---
// Matched as a whole segment rather than `/:file.csv`, because Express 5 treats a dot in
// a route pattern differently from Express 4 and the published names are full of dots.
router.get('/:file', (req, res) => {
  const file = req.params.file;
  const csv = readVersion(file);
  if (csv === null) return res.status(404).type('text/plain').send('Cjenik nije pronađen.');
  sendCsv(res, csv, file);
});

// --- Human-readable page ---
router.get('/', (req, res) => {
  publishIfChanged();
  const version = current();
  const versions = listVersions();

  const rows = SERVICES.map((s) => `
            <tr>
              <td>${esc(s.naziv)}</td>
              <td class="cj-price">${esc(money(s.cijena))} &euro;</td>
              <td class="cj-anchor">${s.sidrena === null
                ? '<span class="cj-new" data-hr>nova usluga</span><span class="cj-new" data-en>new service</span>'
                : esc(money(s.sidrena)) + ' &euro;'}</td>
              <td>${s.posebniOblik ? esc(s.posebniOblik) : '&mdash;'}</td>
            </tr>`).join('');

  const archive = versions.map((v) => `
            <li><a href="/cjenik/${esc(v.file)}">${esc(v.file)}</a>
                <span class="cj-when">${esc(prettyStamp(v.stamp))}</span>
                ${v.file === version.file
                  ? '<span class="cj-current" data-hr>aktualni</span><span class="cj-current" data-en>current</span>'
                  : ''}</li>`).join('');

  const html = `<!DOCTYPE html>
<html lang="hr" data-lang="hr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/images/logo.png">
    <title>Cjenik usluga / Price list - Adventure Kingdom</title>
    <meta name="description" content="Službeni cjenik usluga Adventure Kingdom sa sidrenim cijenama i strojno čitljivom CSV datotekom.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Baloo+2:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
    <style>
        .legal-page { padding: 120px 0 80px; background: var(--bg-light); }
        .legal-content { max-width: 960px; margin: 0 auto; background: white; padding: 48px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
        .legal-content h1 { font-family: var(--font-heading); font-size: 2rem; color: var(--blue-dark); margin-bottom: 8px; }
        .legal-content h2 { font-family: var(--font-heading); font-size: 1.3rem; color: var(--text-dark); margin: 32px 0 12px; }
        .legal-content p, .legal-content li { color: var(--text-muted); line-height: 1.8; font-size: 0.95rem; margin-bottom: 12px; }
        .legal-content .updated { color: var(--stone); font-size: 0.85rem; margin-bottom: 24px; }
        .legal-back { display: inline-flex; align-items: center; gap: 6px; color: var(--gold-dark); font-weight: 600; margin-top: 32px; transition: 0.2s; }
        .legal-back:hover { color: var(--blue-dark); gap: 10px; }
        .cj-table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; font-size: 0.92rem; }
        .cj-table th, .cj-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; color: var(--text-dark); }
        .cj-table th { font-family: var(--font-heading); color: var(--blue-dark); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.4px; }
        .cj-table .cj-price { font-weight: 700; white-space: nowrap; }
        .cj-table .cj-anchor { color: var(--text-muted); white-space: nowrap; }
        .cj-new { font-style: italic; font-size: 0.85rem; }
        .cj-download { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: var(--bg-dark); font-weight: 700; padding: 12px 22px; border-radius: var(--radius-lg); margin: 4px 0 8px; }
        .cj-archive { list-style: none; padding: 0; font-size: 0.88rem; }
        .cj-archive li { padding: 6px 0; border-bottom: 1px solid #f3f3f3; display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
        .cj-archive a { color: var(--gold-dark); font-weight: 600; word-break: break-all; }
        .cj-when { color: var(--stone); font-size: 0.82rem; }
        .cj-current { background: #E8F5E9; color: #1B5E20; font-weight: 700; font-size: 0.74rem; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
        .cj-note { background: #FFF9E6; border: 1px solid rgba(255,215,0,0.5); border-radius: var(--radius-sm); padding: 14px 18px; }
        @media (max-width: 640px) {
            .legal-content { padding: 28px 18px; }
            .cj-table th, .cj-table td { padding: 8px 6px; font-size: 0.86rem; }
        }
    </style>
</head>
<body>
    <nav class="navbar scrolled">
        <div class="nav-container">
            <a href="/" class="nav-logo">
                <img src="/images/logo.png" alt="Adventure Kingdom" class="nav-logo-img">
                <span class="logo-text">Adventure Kingdom</span>
            </a>
            <button class="lang-toggle" id="langToggle" aria-label="Switch language">
                <span data-hr>HR</span><span data-en>EN</span>
                <span class="lang-divider">|</span>
                <span class="lang-switch" data-hr>EN</span><span class="lang-switch" data-en>HR</span>
            </button>
        </div>
    </nav>

    <section class="legal-page">
        <div class="container">
            <div class="legal-content">
                <h1 data-hr>Cjenik usluga</h1>
                <h1 data-en>Price list</h1>
                <p class="updated">
                  <span data-hr>${esc(OUTLET.naziv)} &middot; ${esc(OUTLET.adresa)} &middot; Zadnja objava: ${esc(prettyStamp(version.stamp))}</span>
                  <span data-en>${esc(OUTLET.naziv)} &middot; ${esc(OUTLET.adresa)} &middot; Last published: ${esc(prettyStamp(version.stamp))}</span>
                </p>

                <p class="cj-note" data-hr><strong>Sidrena cijena</strong> je maloprodajna cijena koja je za pojedinu uslugu bila primjenjiva na dan <strong>${REFERENCE_DATE}</strong>, sukladno Odluci o isticanju dodatne cijene (NN 101/2026, izmjena NN 110/2026). Sve cijene su u eurima (EUR) i uključuju PDV.</p>
                <p class="cj-note" data-en>The <strong>anchor price</strong> is the retail price that applied to each service on <strong>10 September 2026</strong>, under the Croatian decision on displaying an additional price (NN 101/2026, amended by NN 110/2026). All prices are in euro (EUR) and include VAT.</p>

                <h2 data-hr>Strojno čitljiv cjenik</h2>
                <h2 data-en>Machine-readable price list</h2>
                <p>
                  <a class="cj-download" href="/cjenik/aktualni.csv">
                    &#x2B07;&#xFE0F; <span data-hr>Preuzmi cjenik (CSV)</span><span data-en>Download price list (CSV)</span>
                  </a>
                </p>
                <p data-hr>Datoteka: <code>${esc(version.file)}</code></p>
                <p data-en>File: <code>${esc(version.file)}</code></p>

                <h2 data-hr>Cijene</h2>
                <h2 data-en>Prices</h2>
                <table class="cj-table">
                    <thead>
                        <tr>
                            <th><span data-hr>Usluga</span><span data-en>Service</span></th>
                            <th><span data-hr>Cijena</span><span data-en>Price</span></th>
                            <th><span data-hr>Cijena na ${REFERENCE_DATE}</span><span data-en>Price on 10 Sept 2026</span></th>
                            <th><span data-hr>Poseban oblik prodaje</span><span data-en>Special sale</span></th>
                        </tr>
                    </thead>
                    <tbody>${rows}
                    </tbody>
                </table>

                <h2 data-hr>Arhiva objavljenih cjenika</h2>
                <h2 data-en>Archive of published price lists</h2>
                <p data-hr>Objavljeni cjenici ostaju dostupni ${RETENTION_DAYS} dana od objave, odnosno od svake promjene.</p>
                <p data-en>Published price lists stay available for ${RETENTION_DAYS} days from publication or from each change.</p>
                <ul class="cj-archive">${archive}
                </ul>

                <a href="/" class="legal-back">&larr; <span data-hr>Povratak na početnu</span><span data-en>Back to home</span></a>
            </div>
        </div>
    </section>

    <script src="/js/script.js"></script>
</body>
</html>`;

  noStore(res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(stampAssets(html, '.'));
});

module.exports = router;
