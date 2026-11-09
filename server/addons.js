// --- Reservation add-ons ---
// Validates the add-ons a booking asks for against the catalogue, prices them, and reads
// them back for the dashboards and emails.
//
// Everything is driven by server/addonCatalogue.js: an add-on the catalogue does not list cannot
// be booked, and a price the client sends is always ignored in favour of the catalogue's.

const { db } = require('./database');
const { ADDONS, RETIRED_ADDONS, addonsById } = require('./addonCatalogue');

// Guard rails per pricing mode. 'flat' is always exactly one per party.
const MAX_UNIT_QTY = 20;
// Retired per-unit add-ons kept their old, looser cap (extra children allowed up to 30).
const MAX_RETIRED_QTY = 30;

const insertAddonStmt = db.prepare(`
  INSERT INTO reservation_addons (reservation_id, addon_id, quantity, unit_price, line_total)
  VALUES (@reservation_id, @addon_id, @quantity, @unit_price, @line_total)
`);

const getAddonsStmt = db.prepare(`
  SELECT addon_id, quantity, unit_price, line_total
  FROM reservation_addons
  WHERE reservation_id = ?
  ORDER BY id
`);

const deleteAddonsStmt = db.prepare('DELETE FROM reservation_addons WHERE reservation_id = ?');


/**
 * Turn whatever the client sent into priced, validated line items.
 *
 * Accepts `[{ id, quantity }]`. Unknown ids, zero quantities and add-ons that are not
 * available for the chosen time slot are dropped rather than rejected, so a stale cached
 * page cannot block a booking — it just books without that add-on.
 *
 * Returns { lines, total, rejected } where `rejected` explains anything dropped.
 */
function normalizeAddons(input, { numChildren }) {
  const lines = [];
  const rejected = [];

  if (!Array.isArray(input)) return { lines, total: 0, rejected };

  const seen = new Set();

  for (const raw of input) {
    const id = typeof raw?.id === 'string' ? raw.id : null;
    const item = id ? addonsById[id] : null;

    if (!item) {
      rejected.push({ id, reason: 'not a bookable add-on' });
      continue;
    }

    // One line per add-on; the table enforces this too.
    if (seen.has(id)) {
      rejected.push({ id, reason: 'duplicate' });
      continue;
    }

    let quantity;
    if (item.pricingMode === 'flat') {
      quantity = 1;
    } else if (item.pricingMode === 'per_child') {
      // Charged for every child at the party; the customer does not pick a number.
      quantity = Math.max(1, parseInt(numChildren, 10) || 1);
    } else {
      quantity = Math.min(MAX_UNIT_QTY, Math.max(0, parseInt(raw.quantity, 10) || 0));
      if (quantity === 0) continue; // simply not ordered
    }

    seen.add(id);

    // Price always comes from the catalogue, never from the request.
    const unitPrice = item.price;
    lines.push({
      addon_id: id,
      quantity,
      unit_price: unitPrice,
      line_total: Number((quantity * unitPrice).toFixed(2)),
    });
  }

  const total = Number(lines.reduce((sum, l) => sum + l.line_total, 0).toFixed(2));
  return { lines, total, rejected };
}

/**
 * Rebuild a booking's add-on lines for an admin edit.
 *
 * Two deliberate differences from normalizeAddons:
 *  - a price the booking already carries wins over the catalogue price, so editing an old
 *    booking never silently re-prices it at today's rates;
 *  - an add-on retired from the catalogue stays editable while it is still on the booking,
 *    so the admin can reduce or remove it -- but it cannot be added to a booking without it.
 *
 * `existing` is the current getAddons(id) result. Returns the same shape as normalizeAddons.
 */
function reviseAddons(existing, input, { numChildren }) {
  const bookedPrice = Object.fromEntries((existing || []).map((a) => [a.addon_id, a.unit_price]));
  const lines = [];
  const rejected = [];
  const seen = new Set();

  for (const raw of Array.isArray(input) ? input : []) {
    const id = typeof raw?.id === 'string' ? raw.id : null;
    const item = id ? addonsById[id] : null;
    const onBooking = id ? Object.prototype.hasOwnProperty.call(bookedPrice, id) : false;
    const isRetainedRetired = !item && onBooking && Boolean(RETIRED_ADDONS[id]);

    if (!item && !isRetainedRetired) {
      rejected.push({ id, reason: 'not an editable add-on on this booking' });
      continue;
    }

    if (seen.has(id)) {
      rejected.push({ id, reason: 'duplicate' });
      continue;
    }

    // Retired add-ons were all per-unit; the catalogue decides for everything else.
    const mode = item ? item.pricingMode : 'unit';
    let quantity;
    if (mode === 'flat') {
      quantity = 1;
    } else if (mode === 'per_child') {
      // Follows the headcount, so changing the number of children re-prices these lines.
      quantity = Math.max(1, parseInt(numChildren, 10) || 1);
    } else {
      const cap = item ? MAX_UNIT_QTY : MAX_RETIRED_QTY;
      quantity = Math.min(cap, Math.max(0, parseInt(raw.quantity, 10) || 0));
      if (quantity === 0) continue; // removed from the booking
    }

    seen.add(id);

    const unitPrice = onBooking ? bookedPrice[id] : item.price;
    lines.push({
      addon_id: id,
      quantity,
      unit_price: unitPrice,
      line_total: Number((quantity * unitPrice).toFixed(2)),
    });
  }

  const total = Number(lines.reduce((sum, l) => sum + l.line_total, 0).toFixed(2));
  return { lines, total, rejected };
}

// Must be called inside the same transaction as the reservation insert.
function saveAddons(reservationId, lines) {
  for (const line of lines) {
    insertAddonStmt.run({ reservation_id: reservationId, ...line });
  }
}

function replaceAddons(reservationId, lines) {
  deleteAddonsStmt.run(reservationId);
  saveAddons(reservationId, lines);
}

/** Add-on lines for a reservation, with display names resolved from the catalogue. */
function getAddons(reservationId) {
  return getAddonsStmt.all(reservationId).map((row) => {
    const item = addonsById[row.addon_id];
    const retiredName = RETIRED_ADDONS[row.addon_id];
    return {
      ...row,
      nameHr: item ? item.nameHr : (retiredName ? retiredName.nameHr : row.addon_id),
      nameEn: item ? item.nameEn : (retiredName ? retiredName.nameEn : row.addon_id),
      // An add-on retired from the catalogue still has to render on old bookings.
      retired: !item,
    };
  });
}

module.exports = { normalizeAddons, reviseAddons, saveAddons, replaceAddons, getAddons, ADDONS };
