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
//
// This also replaces a hand-written version (?v=ak2 and the like), so a page that was
// versioned by hand keeps working and stops needing anyone to remember to bump it.

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Any local .js or .css reference, with or without an existing query string.
// Absolute and protocol-relative URLs are filtered out below rather than in the pattern,
// so that a Google Fonts href is recognised and deliberately skipped.
const ASSET_REF = /((?:src|href)=")([^"]+?\.(?:js|css))(\?[^"]*)?(")/g;

const cache = new Map(); // absolute path -> { mtimeMs, tag }

function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

/** Absolute path of an asset referenced from a page, or null if it escapes public/. */
function resolveAsset(url, pageDir) {
  const relative = url.startsWith('/')
    ? url.slice(1)
    : path.posix.join(pageDir === '.' ? '' : pageDir, url);
  const abs = path.resolve(PUBLIC_DIR, relative);
  // Never follow a reference out of the public directory.
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) return null;
  return abs;
}

function versionOf(absPath) {
  try {
    const { mtimeMs } = fs.statSync(absPath);
    const hit = cache.get(absPath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.tag;
    const tag = Math.floor(mtimeMs).toString(36);
    cache.set(absPath, { mtimeMs, tag });
    return tag;
  } catch {
    return null; // file missing — leave the URL exactly as the page wrote it
  }
}

/**
 * Adds ?v=<mtime> to every local script and stylesheet URL in a page.
 *
 * `pageDir` is the page's own directory relative to public/ ('.' for a top-level page,
 * 'arcade' for public/arcade/index.html), because the arcade refers to its files
 * relatively — `core.js`, `vendor/jsnes.min.js` — rather than from the site root.
 */
function stampAssets(html, pageDir = '.') {
  return html.replace(ASSET_REF, (match, before, url, _query, after) => {
    if (isExternal(url)) return match;
    const abs = resolveAsset(url, pageDir);
    if (!abs) return match;
    const v = versionOf(abs);
    return v ? `${before}${url}?v=${v}${after}` : match;
  });
}

module.exports = { stampAssets, PUBLIC_DIR };
