const express = require('express');
const { stmts } = require('../database');

const router = express.Router();

const TIME_SLOTS = ['morning', 'afternoon', 'late-afternoon', 'evening'];
const THEMES = ['forest', 'royal'];

// GET /api/availability?date=YYYY-MM-DD
router.get('/', (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Valid date parameter required (YYYY-MM-DD).' });
  }

  const requestedDate = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requestedDate < today) {
    return res.status(400).json({ error: 'Cannot check availability for past dates.' });
  }

  const sixMonths = new Date(today);
  sixMonths.setMonth(sixMonths.getMonth() + 6);

  if (requestedDate > sixMonths) {
    return res.status(400).json({ error: 'Cannot book more than 6 months in advance.' });
  }

  const booked = stmts.getBookedSlots.all(date);

  // Build availability matrix
  const availability = {};
  for (const slot of TIME_SLOTS) {
    availability[slot] = {};
    for (const theme of THEMES) {
      availability[slot][theme] = true; // available by default
    }
  }

  // Mark booked slots
  // 'both' (Royal) blocks BOTH rooms; single room blocks itself + prevents Royal
  for (const row of booked) {
    if (availability[row.time_slot]) {
      if (row.theme === 'both') {
        // Royal booking blocks both rooms
        availability[row.time_slot]['forest'] = false;
        availability[row.time_slot]['royal'] = false;
      } else {
        availability[row.time_slot][row.theme] = false;
      }
    }
  }

  res.json({ date, availability });
});

module.exports = router;
