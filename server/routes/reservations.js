const express = require('express');
const { db, stmts, calculateTotal } = require('../database');
const { requireAuth, requireStaff, requireRole } = require('../middleware/auth');
const { reservationLimiter } = require('../middleware/rateLimiter');
const { notifyOwner, notifyCustomer, notifyStatusChange } = require('../email');

const router = express.Router();

const VALID_SLOTS = ['morning', 'afternoon', 'late-afternoon', 'evening'];
const VALID_THEMES = ['forest', 'royal', 'both'];
const VALID_PACKAGES = ['lion', 'royal'];

// --- Input sanitization (SQL injection prevention layer on top of parameterized queries) ---
function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLen)
    .replace(/[<>]/g, ''); // strip HTML angle brackets
}

function sanitizePhone(str) {
  if (typeof str !== 'string') return '';
  // Only allow digits, +, spaces, dashes, parens
  return str.trim().slice(0, 30).replace(/[^\d+\s\-()]/g, '');
}

function sanitizeEmail(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().slice(0, 100);
}

// --- PUBLIC: Submit reservation (with transaction for race condition safety) ---
const insertReservationTx = db.transaction((data) => {
  // Check availability inside the transaction — eliminates race condition
  const existing = stmts.getBookedSlots.all(data.party_date);
  const sameSlot = existing.filter(r => r.time_slot === data.time_slot);

  let isBooked = false;

  if (data.theme === 'both') {
    // Royal package needs BOTH rooms — conflict if ANY room is booked in this slot
    isBooked = sameSlot.length > 0;
  } else {
    // Single room — conflict if same room is booked OR a Royal ('both') is booked in this slot
    isBooked = sameSlot.some(r => r.theme === data.theme || r.theme === 'both');
  }

  if (isBooked) {
    return { conflict: true };
  }

  const result = stmts.insertReservation.run(data);
  return { conflict: false, id: result.lastInsertRowid };
});

router.post('/', reservationLimiter, (req, res) => {
  try {
    const {
      parent_name, parent_phone, parent_email,
      child_name, child_age, party_date, theme, time_slot,
      num_children, num_adults, package: pkg,
      addon_pizza, addon_cake, addon_extra_child,
      notes
    } = req.body;

    // Validate required fields
    const errors = [];

    const cleanName = sanitizeString(parent_name, 100);
    const cleanPhone = sanitizePhone(parent_phone);
    const cleanEmail = sanitizeEmail(parent_email);
    const cleanChildName = sanitizeString(child_name, 100);

    if (cleanName.length < 2) errors.push('Parent name is required (min 2 characters).');
    if (cleanPhone.length < 6) errors.push('Valid phone number is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.push('Valid email is required.');
    if (cleanChildName.length < 1) errors.push('Child name is required.');

    const age = parseInt(child_age);
    if (isNaN(age) || age < 1 || age > 12) errors.push('Child age must be between 1 and 12.');

    if (!party_date || !/^\d{4}-\d{2}-\d{2}$/.test(party_date)) errors.push('Valid date is required.');
    if (!VALID_THEMES.includes(theme)) errors.push('Invalid theme selection.');
    if (!VALID_SLOTS.includes(time_slot)) errors.push('Invalid time slot.');
    if (!VALID_PACKAGES.includes(pkg)) errors.push('Invalid package selection.');

    // Date validation
    if (party_date && /^\d{4}-\d{2}-\d{2}$/.test(party_date)) {
      const requestedDate = new Date(party_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(requestedDate.getTime())) {
        errors.push('Invalid date format.');
      } else {
        if (requestedDate <= today) {
          errors.push('Party date must be in the future.');
        }
        const sixMonths = new Date(today);
        sixMonths.setMonth(sixMonths.getMonth() + 6);
        if (requestedDate > sixMonths) {
          errors.push('Cannot book more than 6 months in advance.');
        }
      }
    }

    // Max children: 25 per room (Lion), 50 for Royal (both rooms)
    // Total = num_children + addon_extra_child
    const maxChildren = pkg === 'royal' ? 50 : 25;
    const totalChildren = (parseInt(num_children) || 0) + (parseInt(addon_extra_child) || 0);
    if (totalChildren > maxChildren) {
      errors.push(`Total children (${totalChildren}) exceeds maximum of ${maxChildren} for ${pkg === 'royal' ? 'Royal Party' : 'Lion'} package.`);
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    // Sanitize numeric add-ons (cap at reasonable max)
    const pizzaQty = Math.min(20, Math.max(0, parseInt(addon_pizza) || 0));
    const cakeQty = Math.min(10, Math.max(0, parseInt(addon_cake) || 0));
    const extraChildQty = Math.min(30, Math.max(0, parseInt(addon_extra_child) || 0));
    const childCount = Math.min(maxChildren, Math.max(1, parseInt(num_children) || 1));
    const adultCount = Math.min(50, Math.max(0, parseInt(num_adults) || 0));

    const estimated_total = calculateTotal(pkg, pizzaQty, cakeQty, extraChildQty);

    // Insert inside a transaction to prevent race condition
    try {
      const result = insertReservationTx({
        parent_name: cleanName,
        parent_phone: cleanPhone,
        parent_email: cleanEmail,
        child_name: cleanChildName,
        child_age: age,
        party_date,
        theme,
        time_slot,
        num_children: childCount,
        num_adults: adultCount,
        package: pkg,
        addon_pizza: pizzaQty,
        addon_cake: cakeQty,
        addon_extra_child: extraChildQty,
        estimated_total,
        notes: notes ? sanitizeString(notes, 1000) : null
      });

      if (result.conflict) {
        return res.status(409).json({
          error: 'This time slot is already booked. Please choose a different time or date.'
        });
      }

      res.status(201).json({
        success: true,
        id: result.id,
        estimated_total,
        message: 'Reservation submitted successfully. We will contact you within 48 hours.'
      });

      // Send emails in background (don't block the response)
      const savedReservation = stmts.getReservationById.get(result.id);
      if (savedReservation) {
        notifyOwner(savedReservation).catch(() => {});
        notifyCustomer(savedReservation).catch(() => {});
      }
    } catch (dbErr) {
      // Double safety — catch constraint errors even outside the check
      if (dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || dbErr.message?.includes('UNIQUE constraint')) {
        return res.status(409).json({
          error: 'This time slot is already booked. Please choose a different time or date.'
        });
      }
      throw dbErr;
    }
  } catch (err) {
    console.error('Reservation error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- STAFF: Dashboard stats (MUST be before /:id to avoid route conflict) ---
router.get('/stats/overview', requireAuth, requireStaff, (req, res) => {
  try {
    const stats = stmts.getStats.get();
    const today = stmts.getTodayReservations.all();

    res.json({
      success: true,
      data: { ...stats, today_count: today.length, today }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- STAFF: List reservations ---
router.get('/', requireAuth, requireStaff, (req, res) => {
  try {
    const { status, date, search, upcoming, view } = req.query;
    let reservations;

    // "view" takes precedence — named quick-filter buckets
    if (view === 'active') {
      reservations = stmts.getActiveReservations.all();
    } else if (view === 'archive') {
      reservations = stmts.getArchivedReservations.all();
    } else if (view === 'today') {
      reservations = stmts.getTodayReservations.all();
    } else if (view === 'upcoming' || upcoming === 'true') {
      reservations = stmts.getUpcomingReservations.all();
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      reservations = stmts.getReservationsByDate.all(date);
    } else if (status && ['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) {
      reservations = stmts.getReservationsByStatus.all(status);
    } else {
      reservations = stmts.getReservations.all();
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().slice(0, 100);
      reservations = reservations.filter(r =>
        r.parent_name.toLowerCase().includes(q) ||
        r.parent_email.toLowerCase().includes(q) ||
        r.child_name.toLowerCase().includes(q) ||
        r.parent_phone.includes(q)
      );
    }

    res.json({ success: true, data: reservations });
  } catch (err) {
    console.error('List reservations error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- STAFF: Get single reservation ---
router.get('/:id', requireAuth, requireStaff, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid ID.' });

    const reservation = stmts.getReservationById.get(id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });

    res.json({ success: true, data: reservation });
  } catch (err) {
    console.error('Get reservation error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- STAFF: Update reservation status ---
router.patch('/:id/status', requireAuth, requireStaff, (req, res) => {
  try {
    const { status, rejection_reason } = req.body;
    const id = parseInt(req.params.id);

    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid ID.' });
    if (!['confirmed', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const existing = stmts.getReservationById.get(id);
    if (!existing) return res.status(404).json({ error: 'Reservation not found.' });

    stmts.updateReservationStatus.run(
      status,
      status === 'rejected' ? sanitizeString(rejection_reason || '', 500) : null,
      id
    );

    res.json({ success: true, message: `Reservation ${status}.` });

    // Send email notification to customer on confirm/reject
    if (status === 'confirmed' || status === 'rejected') {
      const updated = stmts.getReservationById.get(id);
      if (updated) {
        notifyStatusChange(updated, status, rejection_reason || null).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- ADMIN: Permanently delete a reservation (admin only — staff cannot delete) ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid ID.' });

    const existing = stmts.getReservationById.get(id);
    if (!existing) return res.status(404).json({ error: 'Reservation not found.' });

    stmts.deleteReservation.run(id);
    res.json({ success: true, message: 'Reservation deleted.' });
  } catch (err) {
    console.error('Delete reservation error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
