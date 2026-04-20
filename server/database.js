const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use persistent disk path on Render, local data/ folder otherwise
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'adventure.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    parent_email TEXT NOT NULL,
    child_name TEXT NOT NULL,
    child_age INTEGER NOT NULL CHECK(child_age >= 1 AND child_age <= 12),
    party_date TEXT NOT NULL,
    theme TEXT NOT NULL CHECK(theme IN ('forest', 'royal', 'both')),
    time_slot TEXT NOT NULL CHECK(time_slot IN ('morning', 'afternoon', 'late-afternoon', 'evening')),
    num_children INTEGER NOT NULL DEFAULT 1,
    num_adults INTEGER NOT NULL DEFAULT 1,
    package TEXT NOT NULL CHECK(package IN ('lion', 'royal')),
    addon_pizza INTEGER NOT NULL DEFAULT 0,
    addon_cake INTEGER NOT NULL DEFAULT 0,
    addon_extra_child INTEGER NOT NULL DEFAULT 0,
    estimated_total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    label_hr TEXT NOT NULL DEFAULT '',
    label_en TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_hr TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description_hr TEXT,
    description_en TEXT,
    event_date TEXT NOT NULL,
    event_time TEXT,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Partial unique index for double-booking prevention
// Only one pending or confirmed reservation per date+slot+theme
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_no_double_booking
  ON reservations(party_date, time_slot, theme)
  WHERE status IN ('pending', 'confirmed');
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(party_date);
  CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
  CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(party_date, status);
  CREATE INDEX IF NOT EXISTS idx_reservations_created ON reservations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(parent_email);
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
`);

// --- Pricing ---
const PRICES = {
  packages: { lion: 290, royal: 440 },
  addons: { pizza: 10, cake: 20, extra_child: 8 }
};

function calculateTotal(pkg, addonPizza, addonCake, addonExtraChild) {
  const base = PRICES.packages[pkg] || 0;
  return base
    + (addonPizza || 0) * PRICES.addons.pizza
    + (addonCake || 0) * PRICES.addons.cake
    + (addonExtraChild || 0) * PRICES.addons.extra_child;
}

// --- Prepared statements ---
const stmts = {
  insertReservation: db.prepare(`
    INSERT INTO reservations (parent_name, parent_phone, parent_email, child_name, child_age,
      party_date, theme, time_slot, num_children, num_adults, package,
      addon_pizza, addon_cake, addon_extra_child, estimated_total, notes)
    VALUES (@parent_name, @parent_phone, @parent_email, @child_name, @child_age,
      @party_date, @theme, @time_slot, @num_children, @num_adults, @package,
      @addon_pizza, @addon_cake, @addon_extra_child, @estimated_total, @notes)
  `),

  getBookedSlots: db.prepare(`
    SELECT time_slot, theme FROM reservations
    WHERE party_date = ? AND status IN ('pending', 'confirmed')
  `),

  getReservations: db.prepare(`
    SELECT * FROM reservations ORDER BY created_at DESC
  `),

  getReservationsByDate: db.prepare(`
    SELECT * FROM reservations WHERE party_date = ? ORDER BY time_slot
  `),

  getReservationsByStatus: db.prepare(`
    SELECT * FROM reservations WHERE status = ? ORDER BY party_date ASC, time_slot ASC
  `),

  getReservationById: db.prepare(`
    SELECT * FROM reservations WHERE id = ?
  `),

  updateReservationStatus: db.prepare(`
    UPDATE reservations SET status = ?, rejection_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  getStats: db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM reservations
  `),

  getTodayReservations: db.prepare(`
    SELECT * FROM reservations
    WHERE party_date = date('now', 'localtime')
    AND status IN ('pending', 'confirmed')
    ORDER BY time_slot
  `),

  getUpcomingReservations: db.prepare(`
    SELECT * FROM reservations
    WHERE party_date >= date('now', 'localtime')
    AND status IN ('pending', 'confirmed')
    ORDER BY party_date ASC, time_slot ASC
  `),

  // "Active" = everything worth looking at NOW: pending (any date) + upcoming confirmed
  getActiveReservations: db.prepare(`
    SELECT * FROM reservations
    WHERE status = 'pending'
       OR (status = 'confirmed' AND party_date >= date('now', 'localtime'))
    ORDER BY party_date ASC, time_slot ASC
  `),

  // "Archived" = old (past date) or rejected/cancelled
  getArchivedReservations: db.prepare(`
    SELECT * FROM reservations
    WHERE status IN ('rejected', 'cancelled')
       OR (status = 'confirmed' AND party_date < date('now', 'localtime'))
    ORDER BY party_date DESC, time_slot ASC
  `),

  deleteReservation: db.prepare(`
    DELETE FROM reservations WHERE id = ?
  `),

  // Events
  getPublishedEvents: db.prepare(`
    SELECT * FROM events
    WHERE is_published = 1 AND event_date >= date('now', 'localtime')
    ORDER BY event_date ASC
    LIMIT 12
  `),

  getAllEvents: db.prepare(`
    SELECT * FROM events ORDER BY event_date DESC
  `),

  getEventById: db.prepare(`
    SELECT * FROM events WHERE id = ?
  `),

  insertEvent: db.prepare(`
    INSERT INTO events (title_hr, title_en, description_hr, description_en, event_date, event_time, is_published)
    VALUES (@title_hr, @title_en, @description_hr, @description_en, @event_date, @event_time, @is_published)
  `),

  updateEvent: db.prepare(`
    UPDATE events SET title_hr=@title_hr, title_en=@title_en, description_hr=@description_hr,
      description_en=@description_en, event_date=@event_date, event_time=@event_time,
      is_published=@is_published, updated_at=datetime('now')
    WHERE id=@id
  `),

  deleteEvent: db.prepare(`
    DELETE FROM events WHERE id = ?
  `),

  // Gallery
  getGalleryImages: db.prepare(`
    SELECT * FROM gallery_images ORDER BY sort_order ASC, id ASC
  `),

  getGalleryImageById: db.prepare(`
    SELECT * FROM gallery_images WHERE id = ?
  `),

  insertGalleryImage: db.prepare(`
    INSERT INTO gallery_images (filename, label_hr, label_en, sort_order)
    VALUES (@filename, @label_hr, @label_en, @sort_order)
  `),

  updateGalleryImage: db.prepare(`
    UPDATE gallery_images SET label_hr=@label_hr, label_en=@label_en, sort_order=@sort_order
    WHERE id=@id
  `),

  deleteGalleryImage: db.prepare(`
    DELETE FROM gallery_images WHERE id = ?
  `)
};

module.exports = { db, stmts, calculateTotal, PRICES, dbPath };
