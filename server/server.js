require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const compression = require('compression');
const { globalLimiter, slowDown } = require('./middleware/rateLimiter');
const { db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(globalLimiter);
app.use(slowDown);

// Strict body size limits to prevent server overload
app.use(express.json({ limit: '5kb' }));
app.use(express.urlencoded({ extended: false, limit: '5kb' }));

// Block requests with suspicious content-types
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const ct = req.headers['content-type'];
    if (ct && !ct.includes('application/json') && !ct.includes('application/x-www-form-urlencoded')) {
      return res.status(415).json({ error: 'Unsupported content type.' });
    }
  }
  next();
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

app.use('/api/auth', authRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/events', eventRoutes);

// Apply CSRF to public reservation POST only
app.post('/api/reservations', csrfProtection);
app.use('/api/reservations', reservationRoutes);

// --- Page routes (serve HTML for dashboard pages) ---
app.get('/staff', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'staff.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terms.html'));
});

// --- Database backup endpoint (admin only) ---
const { requireAuth, requireRole } = require('./middleware/auth');
app.get('/api/admin/backup', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const fs = require('fs');
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

    // SQLite online backup via VACUUM INTO
    db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);

    res.json({
      success: true,
      message: `Backup created: backup-${timestamp}.db`,
      path: backupPath
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
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const backupPath = path.join(backupDir, `auto-backup-${timestamp}.db`);

    // Only backup once per day
    if (!fs.existsSync(backupPath)) {
      db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);
      console.log(`Auto-backup created: auto-backup-${timestamp}.db`);

      // Keep only last 14 daily backups
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('auto-backup-'))
        .sort()
        .reverse();

      for (let i = 14; i < files.length; i++) {
        fs.unlinkSync(path.join(backupDir, files[i]));
        console.log(`Old backup removed: ${files[i]}`);
      }
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
