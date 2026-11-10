// AK Arcade: high scores and tournament day.
//
// Everything here lives in its own tables (all prefixed arcade_). This module only ever
// CREATEs them IF NOT EXISTS; it never alters or reads the reservation, event or gallery tables.

const { db } = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS arcade_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_guardian INTEGER NOT NULL DEFAULT 0,
    consent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS arcade_tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    stopped_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS arcade_tournament_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES arcade_tournaments(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES arcade_players(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tournament_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS arcade_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    player_id INTEGER REFERENCES arcade_players(id) ON DELETE SET NULL,
    tournament_id INTEGER REFERENCES arcade_tournaments(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_arcade_scores_game ON arcade_scores (game_id, score DESC);
  CREATE INDEX IF NOT EXISTS idx_arcade_scores_tournament ON arcade_scores (tournament_id, player_id, score DESC);
  CREATE INDEX IF NOT EXISTS idx_arcade_players_email ON arcade_players (email);
`);

// Games that keep a score. Concentration Room has no score, so it cannot host a tournament.
const GAMES = {
  glitchrun: 'Glitch Run',
  rivetrush: 'Rivet Rush',
  starhopper: 'Star Hopper'
};

// How long the "tournament over" banner and final standings stay public.
const RESULTS_VISIBLE_DAYS = 3;
// How long contact details are kept after a player's last tournament ends.
const CONTACT_RETENTION_DAYS = 30;

const nowIso = () => new Date().toISOString();
const daysAgoIso = days => new Date(Date.now() - days * 86400000).toISOString();

const q = {
  // --- tournaments ---
  activeTournament: db.prepare(`
    SELECT * FROM arcade_tournaments
    WHERE stopped_at IS NULL AND starts_at <= @now AND ends_at > @now
    ORDER BY id DESC LIMIT 1
  `),
  // The most recent tournament that has finished (ran out or was stopped).
  lastFinished: db.prepare(`
    SELECT *, COALESCE(stopped_at, ends_at) AS ended_at FROM arcade_tournaments
    WHERE stopped_at IS NOT NULL OR ends_at <= @now
    ORDER BY COALESCE(stopped_at, ends_at) DESC LIMIT 1
  `),
  tournamentById: db.prepare(`SELECT * FROM arcade_tournaments WHERE id = ?`),
  allTournaments: db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM arcade_tournament_entries e WHERE e.tournament_id = t.id) AS players
    FROM arcade_tournaments t ORDER BY t.id DESC LIMIT 50
  `),
  insertTournament: db.prepare(`
    INSERT INTO arcade_tournaments (game_id, title, starts_at, ends_at)
    VALUES (@game_id, @title, @starts_at, @ends_at)
  `),
  stopTournament: db.prepare(`UPDATE arcade_tournaments SET stopped_at = @now WHERE id = @id AND stopped_at IS NULL`),

  // --- players ---
  playerByToken: db.prepare(`SELECT * FROM arcade_players WHERE token = ?`),
  playerByEmail: db.prepare(`SELECT * FROM arcade_players WHERE email = ? ORDER BY id DESC LIMIT 1`),
  insertPlayer: db.prepare(`
    INSERT INTO arcade_players (token, display_name, email, phone, is_guardian, consent_at)
    VALUES (@token, @display_name, @email, @phone, @is_guardian, @consent_at)
  `),
  updatePlayer: db.prepare(`
    UPDATE arcade_players
    SET token = @token, display_name = @display_name, phone = @phone, is_guardian = @is_guardian, consent_at = @consent_at
    WHERE id = @id
  `),
  entry: db.prepare(`SELECT id FROM arcade_tournament_entries WHERE tournament_id = ? AND player_id = ?`),
  insertEntry: db.prepare(`INSERT OR IGNORE INTO arcade_tournament_entries (tournament_id, player_id) VALUES (?, ?)`),

  // --- scores ---
  insertScore: db.prepare(`
    INSERT INTO arcade_scores (game_id, name, score, player_id, tournament_id)
    VALUES (@game_id, @name, @score, @player_id, @tournament_id)
  `),
  scoreById: db.prepare(`SELECT * FROM arcade_scores WHERE id = ?`),
  deleteScore: db.prepare(`DELETE FROM arcade_scores WHERE id = ?`),
  // Public all-time board: initials and score only.
  topScores: db.prepare(`
    SELECT name, score FROM arcade_scores
    WHERE game_id = ? AND tournament_id IS NULL
    ORDER BY score DESC, id ASC LIMIT ?
  `),
  // Admin all-time board: includes the contact details when the player has joined a tournament.
  topScoresAdmin: db.prepare(`
    SELECT s.id, s.name, s.score, s.created_at, p.display_name, p.email, p.phone
    FROM arcade_scores s LEFT JOIN arcade_players p ON p.id = s.player_id
    WHERE s.game_id = ? AND s.tournament_id IS NULL
    ORDER BY s.score DESC, s.id ASC LIMIT ?
  `),
  // Tournament standings: each player's best score, earliest best first on ties.
  standings: db.prepare(`
    SELECT p.id AS player_id, p.display_name, p.email, p.phone, e.joined_at,
      best.id AS score_id, best.score AS score, best.created_at AS scored_at,
      (SELECT COUNT(*) FROM arcade_scores c WHERE c.tournament_id = e.tournament_id AND c.player_id = p.id) AS plays
    FROM arcade_tournament_entries e
    JOIN arcade_players p ON p.id = e.player_id
    LEFT JOIN arcade_scores best ON best.id = (
      SELECT s.id FROM arcade_scores s
      WHERE s.tournament_id = e.tournament_id AND s.player_id = p.id
      ORDER BY s.score DESC, s.id ASC LIMIT 1
    )
    WHERE e.tournament_id = ?
    ORDER BY (best.score IS NULL) ASC, best.score DESC, best.id ASC, e.id ASC
  `),

  // --- retention ---
  // Players whose every tournament finished more than the retention period ago.
  stalePlayers: db.prepare(`
    SELECT p.id FROM arcade_players p
    WHERE (p.email IS NOT NULL OR p.phone IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM arcade_tournament_entries e
        JOIN arcade_tournaments t ON t.id = e.tournament_id
        WHERE e.player_id = p.id AND COALESCE(t.stopped_at, t.ends_at) > @cutoff
      )
      AND p.created_at < @cutoffSql
  `),
  anonymisePlayer: db.prepare(`UPDATE arcade_players SET email = NULL, phone = NULL WHERE id = ?`)
};

/** Removes e-mail addresses and phone numbers once the retention period has passed. */
function purgeOldContacts() {
  const cutoff = daysAgoIso(CONTACT_RETENTION_DAYS);
  // created_at uses SQLite's "YYYY-MM-DD HH:MM:SS" format, so compare it in that format.
  const cutoffSql = cutoff.slice(0, 19).replace('T', ' ');
  const stale = q.stalePlayers.all({ cutoff, cutoffSql });
  const run = db.transaction(rows => { for (const r of rows) q.anonymisePlayer.run(r.id); });
  run(stale);
  return stale.length;
}

module.exports = { db, q, GAMES, RESULTS_VISIBLE_DAYS, CONTACT_RETENTION_DAYS, nowIso, daysAgoIso, purgeOldContacts };
