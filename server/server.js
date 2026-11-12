const path = require('path');
// Load .env from the project root with an absolute path (Passenger doesn't always set cwd correctly).
// override:true ensures our .env values win over any empty vars Passenger pre-sets.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const compression = require('compression');
const { globalLimiter, slowDown } = require('./middleware/rateLimiter');
const { db, dbPath } = require('./database');
const { stampAssets } = require('./assetVersion');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required for Render — sits behind a reverse proxy)
app.set('trust proxy', 1);

// --- CSRF token store (in-memory, 15min TTL) ---
const csrfTokens = new Map();

function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, Date.now() + 15 * 60 * 1000);
  return token;
}

// Clean expired CSRF tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of csrfTokens) {
    if (v < now) csrfTokens.delete(k);
  }
}, 5 * 60 * 1000);

function verifyCsrfToken(token) {
  if (!token || typeof token !== 'string' || !csrfTokens.has(token)) return false;
  const expires = csrfTokens.get(token);
  csrfTokens.delete(token); // one-time use
  return expires > Date.now();
}

// --- Security Headers ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// --- Health check (before rate limiters) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Gzip compression (all responses) ---
app.use(compression());

// --- Request protections ---
app.use(cors({ origin: false })); // same-origin only
// The arcade (its static files and its API) is exempt from the site-wide limits: on tournament
// day a whole room of players shares one Wi-Fi address, and their traffic must not lock the
// booking site out for everyone else there. The arcade API has its own limits (routes/arcade.js).
const isArcadeRequest = (req) => req.path.startsWith('/arcade/') || req.path.startsWith('/api/arcade/');
// The published price list is exempt too: point VII of the Odluka (NN 101/2026) requires
// that automated tools be able to collect prices in real time, which the limiters block.
// Everything under /cjenik is public, read-only price data.
const isPriceListRequest = (req) => req.path === '/cjenik' || req.path.startsWith('/cjenik/');
const isExempt = (req) => isArcadeRequest(req) || isPriceListRequest(req);
app.use((req, res, next) => (isExempt(req) ? next() : globalLimiter(req, res, next)));
app.use((req, res, next) => (isExempt(req) ? next() : slowDown(req, res, next)));

// Strict body size limits to prevent server overload
app.use(express.json({ limit: '5kb' }));
app.use(express.urlencoded({ extended: false, limit: '5kb' }));

// Block requests with suspicious content-types
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const ct = req.headers['content-type'];
    if (ct && !ct.includes('application/json') && !ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) {
      return res.status(415).json({ error: 'Unsupported content type.' });
    }
  }
  next();
});

// --- Pages ---
// Served by hand rather than by express.static so their asset URLs can be stamped with a
// version. See server/assetVersion.js for why that is necessary on this host.
function sendPage(res, fileName) {
  const filePath = path.join(__dirname, '..', 'public', fileName);
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    // The arcade refers to its scripts relatively, so stamping needs the page's folder.
    res.send(stampAssets(html, path.posix.dirname(fileName)));
  });
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let name = req.path === '/' ? 'index.html' : req.path.slice(1);
  // A folder URL such as /arcade/ means that folder's index.html.
  if (name.endsWith('/')) name += 'index.html';
  if (!name.endsWith('.html') || name.includes('..')) return next();

  // Resolve and confirm the file really sits inside public/ before reading it.
  const publicDir = path.join(__dirname, '..', 'public');
  const filePath = path.resolve(publicDir, name);
  if (!filePath.startsWith(publicDir + path.sep)) return next();
  if (!fs.existsSync(filePath)) return next();

  return sendPage(res, name);
});

// --- Static files (no caching during development, cache images in production) ---
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // cache images 1 day
    }
  }
}));

// --- CSRF endpoint ---
app.get('/api/csrf-token', (req, res) => {
  res.json({ token: generateCsrfToken() });
});

// --- CSRF middleware for public POST routes ---
function csrfProtection(req, res, next) {
  const token = req.headers['x-csrf-token'];
  if (!verifyCsrfToken(token)) {
    return res.status(403).json({ error: 'Invalid or expired security token. Please refresh and try again.' });
  }
  next();
}

// --- API Routes ---
const authRoutes = require('./routes/auth');
const reservationRoutes = require('./routes/reservations');
const eventRoutes = require('./routes/events');
const availabilityRoutes = require('./routes/availability');
const galleryRoutes = require('./routes/gallery');

// Serve gallery images from persistent disk
const galleryDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'gallery');
app.use('/gallery-images', express.static(galleryDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

app.use('/api/auth', authRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gallery', galleryRoutes);

// Apply CSRF to public reservation POST only
app.post('/api/reservations', csrfProtection);
app.use('/api/reservations', reservationRoutes);

// AK Arcade: high scores and tournament day. The join form carries personal data, so it
// gets the same CSRF check as a reservation.
app.post('/api/arcade/join', csrfProtection);
app.use('/api/arcade', require('./routes/arcade'));

// --- Page routes (serve HTML for dashboard pages) ---
app.get('/staff', (req, res) => sendPage(res, 'staff.html'));
app.get('/admin', (req, res) => sendPage(res, 'admin.html'));
// Cjenik: the machine-readable price list and its human-readable page (NN 101/2026).
app.use('/cjenik', require('./routes/cjenik'));

app.get('/privacy', (req, res) => sendPage(res, 'privacy.html'));
app.get('/terms', (req, res) => sendPage(res, 'terms.html'));

// --- Database backup endpoint (admin only) ---
const { requireAuth, requireRole } = require('./middleware/auth');
app.get('/api/admin/backup', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const fs = require('fs');
    const backupDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Server-generated timestamp, sanitized to safe characters only
    const timestamp = new Date().toISOString().replace(/[^0-9A-Za-z]/g, '-');
    const filename = `backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    // Use better-sqlite3's native backup API — no SQL string concat, safe under concurrent writes
    db.backup(backupPath)
      .then(() => res.json({ success: true, message: `Backup created: ${filename}` }))
      .catch((err) => {
        console.error('Backup error:', err);
        res.status(500).json({ error: 'Backup failed.' });
      });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed.' });
  }
});

// --- Automated daily backup (runs at startup + every 24h) ---
function runScheduledBackup() {
  try {
    const fs = require('fs');
    const backupDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD only
    const filename = `auto-backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    // Only backup once per day
    if (!fs.existsSync(backupPath)) {
      db.backup(backupPath)
        .then(() => {
          console.log(`Auto-backup created: ${filename}`);

          // Keep only last 14 daily backups
          const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('auto-backup-'))
            .sort()
            .reverse();

          for (let i = 14; i < files.length; i++) {
            fs.unlinkSync(path.join(backupDir, files[i]));
            console.log(`Old backup removed: ${files[i]}`);
          }
        })
        .catch((err) => console.error('Auto-backup error:', err));
    }
  } catch (err) {
    console.error('Scheduled backup error:', err);
  }
}

// Run backup on startup and every 24 hours
runScheduledBackup();
setInterval(runScheduledBackup, 24 * 60 * 60 * 1000);

// --- 404 for unknown API routes ---
app.all('/api/{*splat}', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// --- Error handler ---
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  db.close();
  process.exit(0);
});

// --- Start ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Adventure Kingdom server running on port ${PORT}`);
});
