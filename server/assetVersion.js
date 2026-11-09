// --- Cache-busting for scripts and stylesheets ---
//
// The host serves .js and .css with `max-age=2592000` (30 days) no matter what this app
// asks for in its own Cache-Control header. A deploy therefore leaves returning visitors
// running an old script against new HTML — which is how a booking can show eight add-ons
// while the cached script only knows how to read two of them.
//
// HTML is never cached, so the fix is to stamp each asset URL with the file's modification
// time. A changed file becomes a new URL and is fetched fresh; an unchanged file keeps its
// cached copy. Nothing to remember at deploy time, and no hosting config required.

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Matches src="js/foo.js" and href="css/foo.css" — the only local assets the pages use.
const ASSET_REF = /((?:src|href)=")((?:js|css)\/[^"?]+)(")/g;

const cache = new Map(); // relative path -> { mtimeMs, tag }

function versionOf(relPath) {
  try {
    const { mtimeMs } = fs.statSync(path.join(PUBLIC_DIR, relPath));
    const hit = cache.get(relPath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.tag;
    const tag = Math.floor(mtimeMs).toString(36);
    cache.set(relPath, { mtimeMs, tag });
    return tag;
  } catch {
    return null; // file missing — leave the URL exactly as the page wrote it
  }
}

/** Adds ?v=<mtime> to every local script and stylesheet URL in a page. */
function stampAssets(html) {
  return html.replace(ASSET_REF, (match, before, relPath, after) => {
    const v = versionOf(relPath);
    return v ? `${before}${relPath}?v=${v}${after}` : match;
  });
}

module.exports = { stampAssets, PUBLIC_DIR };
