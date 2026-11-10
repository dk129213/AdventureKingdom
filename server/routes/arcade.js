const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { db, q, GAMES, RESULTS_VISIBLE_DAYS, nowIso, daysAgoIso, purgeOldContacts } = require('../arcadeDb');

const router = express.Router();
const admin = [requireAuth, requireRole('admin')];

// --- Rate limits (the arcade is exempt from the site-wide limiter, see server.js) ---
// Tournament day can put a whole room of players behind one Wi-Fi address, so these are
// sized per network rather than per person.
const limiter = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: message }
});
router.use(limiter(5 * 60 * 1000, 900, 'Too many requests. Please slow down.'));
const scoreLimiter = limiter(60 * 1000, 120, 'Too many scores at once. Please wait a moment.');
const joinLimiter = limiter(15 * 60 * 1000, 40, 'Too many sign-ups from this network. Please try again later.');

// --- Validation helpers ---
const MAX_SCORE = 9999999;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

// Strips control characters and angle brackets, collapses whitespace, and caps the length.
function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
function cleanInitials(value) {
  const s = (typeof value === 'string' ? value : '').toUpperCase().replace(/[^A-Z0-9 .]/g, '').slice(0, 3);
  return s.trim() ? s.padEnd(3, ' ') : 'AAA';
}
function cleanScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 0 && i <= MAX_SCORE ? i : null;
}
const isToken = t => typeof t === 'string' && /^[a-f0-9]{48}$/.test(t);
const newToken = () => crypto.randomBytes(24).toString('hex');

function publicTournament(t) {
  return t && { id: t.id, game_id: t.game_id, game_title: GAMES[t.game_id] || t.game_id, title: t.title, starts_at: t.starts_at, ends_at: t.ends_at };
}
function publicStandings(tournamentId, limit) {
  return q.standings.all(tournamentId)
    .filter(r => r.score !== null)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, name: r.display_name, score: r.score }));
}

// ============================================================ PUBLIC

// What the arcade page needs to know on load: is a tournament on, or did one just finish?
router.get('/status', (req, res) => {
  try {
    const now = nowIso();
    const active = q.activeTournament.get({ now });
    let recent = null;
    if (!active) {
      const last = q.lastFinished.get({ now });
      if (last && last.ended_at > daysAgoIso(RESULTS_VISIBLE_DAYS)) {
        const top = publicStandings(last.id, 3);
        recent = { ...publicTournament(last), ended_at: last.ended_at, winner: top[0] || null, top };
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, now, games: GAMES, tournament: publicTournament(active) || null, recent });
  } catch (err) {
    console.error('Arcade status error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// All-time top 10 for one game (initials and score only).
router.get('/scores', (req, res) => {
  try {
    const game = String(req.query.game || '');
    if (!GAMES[game]) return res.status(400).json({ error: 'Unknown game.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, game, data: q.topScores.all(game, 10) });
  } catch (err) {
    console.error('Arcade scores error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Live standings of the running tournament, or the final standings of one that just ended.
router.get('/tournament/leaderboard', (req, res) => {
  try {
    const now = nowIso();
    let t = q.activeTournament.get({ now });
    if (!t) {
      const last = q.lastFinished.get({ now });
      if (last && last.ended_at > daysAgoIso(RESULTS_VISIBLE_DAYS)) t = last;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!t) return res.json({ success: true, tournament: null, data: [] });
    res.json({ success: true, tournament: publicTournament(t), data: publicStandings(t.id, 20) });
  } catch (err) {
    console.error('Arcade leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Is this device's saved player still part of the running tournament?
router.post('/me', (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!isToken(token)) return res.json({ success: true, joined: false });
    const player = q.playerByToken.get(token);
    const t = q.activeTournament.get({ now: nowIso() });
    const joined = !!(player && t && q.entry.get(t.id, player.id));
    res.json({ success: true, joined, name: joined ? player.display_name : null });
  } catch (err) {
    console.error('Arcade me error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Save a score.
//   kind "board":      a high score with initials for the all-time table (anyone).
//   kind "tournament": a finished game by a player who joined the running tournament.
router.post('/scores', scoreLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const game = String(body.game || '');
    if (!GAMES[game]) return res.status(400).json({ error: 'Unknown game.' });
    const score = cleanScore(body.score);
    if (score === null) return res.status(400).json({ error: 'Invalid score.' });

    const player = isToken(body.token) ? q.playerByToken.get(body.token) : null;

    if (body.kind === 'tournament') {
      const t = q.activeTournament.get({ now: nowIso() });
      if (!t || t.game_id !== game) return res.status(409).json({ error: 'No tournament is running for this game.' });
      if (!player || !q.entry.get(t.id, player.id)) return res.status(403).json({ error: 'Join the tournament first.' });
      q.insertScore.run({ game_id: game, name: player.display_name, score, player_id: player.id, tournament_id: t.id });
      const standings = q.standings.all(t.id).filter(r => r.score !== null);
      const rank = standings.findIndex(r => r.player_id === player.id) + 1;
      const mine = standings[rank - 1];
      return res.status(201).json({ success: true, rank, best: mine ? mine.score : score, players: standings.length });
    }

    if (score === 0) return res.status(400).json({ error: 'Invalid score.' });
    q.insertScore.run({
      game_id: game, name: cleanInitials(body.name), score,
      player_id: player ? player.id : null, tournament_id: null
    });
    res.status(201).json({ success: true, data: q.topScores.all(game, 10) });
  } catch (err) {
    console.error('Arcade save score error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Join the running tournament. CSRF-protected in server.js.
router.post('/join', joinLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const display_name = cleanText(body.display_name, 16);
    const email = cleanText(body.email, 120).toLowerCase();
    const phone = cleanText(body.phone, 30).replace(/[^0-9+ ()\/-]/g, '');

    if (display_name.length < 2) return res.status(400).json({ error: 'Please enter a player name (2 to 16 characters).' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid e-mail address.' });
    if (body.guardian !== true) return res.status(400).json({ error: 'A parent or guardian (or a player aged 16 or over) must confirm the entry.' });
    if (body.consent !== true) return res.status(400).json({ error: 'Please accept the privacy notice to join.' });

    const t = q.activeTournament.get({ now: nowIso() });
    if (!t) return res.status(409).json({ error: 'There is no tournament running right now.' });

    const token = newToken();
    const consent_at = nowIso();
    const join = db.transaction(() => {
      // One player per e-mail address: signing up again moves the entry to this device.
      const existing = q.playerByEmail.get(email);
      let playerId;
      if (existing) {
        q.updatePlayer.run({ id: existing.id, token, display_name, phone: phone || existing.phone || null, is_guardian: 1, consent_at });
        playerId = existing.id;
      } else {
        playerId = q.insertPlayer.run({ token, display_name, email, phone: phone || null, is_guardian: 1, consent_at }).lastInsertRowid;
      }
      q.insertEntry.run(t.id, playerId);
    });
    join();

    res.status(201).json({ success: true, token, name: display_name, tournament: publicTournament(t) });
  } catch (err) {
    console.error('Arcade join error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================ ADMIN

function adminTournament(t) {
  if (!t) return null;
  const now = nowIso();
  const ended_at = t.stopped_at || (t.ends_at <= now ? t.ends_at : null);
  return { ...t, game_title: GAMES[t.game_id] || t.game_id, active: !ended_at && t.starts_at <= now, ended_at };
}

// Everything the Arcade tab shows.
router.get('/admin/overview', admin, (req, res) => {
  try {
    const now = nowIso();
    const active = q.activeTournament.get({ now });
    const boards = {};
    for (const id of Object.keys(GAMES)) boards[id] = q.topScoresAdmin.all(id, 20);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true, now, games: GAMES,
      active: adminTournament(active),
      tournaments: q.allTournaments.all().map(adminTournament),
      boards
    });
  } catch (err) {
    console.error('Arcade admin overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Standings of one tournament, with contact details.
router.get('/admin/tournaments/:id', admin, (req, res) => {
  try {
    const t = q.tournamentById.get(parseInt(req.params.id, 10));
    if (!t) return res.status(404).json({ error: 'Tournament not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, tournament: adminTournament(t), data: q.standings.all(t.id) });
  } catch (err) {
    console.error('Arcade admin tournament error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Start tournament day.
router.post('/admin/tournaments', admin, (req, res) => {
  try {
    const body = req.body || {};
    const game_id = String(body.game_id || '');
    if (!GAMES[game_id]) return res.status(400).json({ error: 'Pick a game for the tournament.' });

    const end = new Date(body.ends_at);
    if (Number.isNaN(end.getTime())) return res.status(400).json({ error: 'Pick a valid end date and time.' });
    const now = new Date();
    if (end.getTime() < now.getTime() + 5 * 60 * 1000) return res.status(400).json({ error: 'The tournament must run for at least 5 minutes.' });
    if (end.getTime() > now.getTime() + 60 * 86400000) return res.status(400).json({ error: 'The tournament cannot run longer than 60 days.' });

    const title = cleanText(body.title, 60) || 'Tournament Day';

    const start = db.transaction(() => {
      if (q.activeTournament.get({ now: now.toISOString() })) return null;
      return q.insertTournament.run({ game_id, title, starts_at: now.toISOString(), ends_at: end.toISOString() }).lastInsertRowid;
    });
    const id = start();
    if (!id) return res.status(409).json({ error: 'A tournament is already running. Stop it before starting another.' });
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('Arcade start tournament error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Stop a tournament early.
router.post('/admin/tournaments/:id/stop', admin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!q.tournamentById.get(id)) return res.status(404).json({ error: 'Tournament not found.' });
    q.stopTournament.run({ id, now: nowIso() });
    res.json({ success: true });
  } catch (err) {
    console.error('Arcade stop tournament error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Remove one score (all-time or tournament).
router.delete('/admin/scores/:id', admin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!q.scoreById.get(id)) return res.status(404).json({ error: 'Score not found.' });
    q.deleteScore.run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Arcade delete score error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Results as a spreadsheet file.
router.get('/admin/tournaments/:id/export', admin, (req, res) => {
  try {
    const t = q.tournamentById.get(parseInt(req.params.id, 10));
    if (!t) return res.status(404).json({ error: 'Tournament not found.' });
    // Quote every cell, and defuse cells a spreadsheet would run as a formula.
    const cell = v => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [['Rank', 'Player', 'E-mail', 'Phone', 'Best score', 'Games played', 'Joined (UTC)', 'Best score set (UTC)']];
    q.standings.all(t.id).forEach((r, i) => {
      rows.push([r.score === null ? '' : i + 1, r.display_name, r.email, r.phone, r.score, r.plays, r.joined_at, r.scored_at]);
    });
    const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ak-arcade-tournament-${t.id}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (err) {
    console.error('Arcade export error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- Contact-detail retention: run at startup and once a day ---
function runPurge() {
  try {
    const n = purgeOldContacts();
    if (n) console.log(`Arcade: removed contact details of ${n} past tournament player(s).`);
  } catch (err) {
    console.error('Arcade retention error:', err);
  }
}
runPurge();
setInterval(runPurge, 24 * 60 * 60 * 1000).unref();

module.exports = router;
