const express = require('express');
const { stmts } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// --- PUBLIC: Get published upcoming events ---
router.get('/', (req, res) => {
  try {
    const events = stmts.getPublishedEvents.all();
    res.json({ success: true, data: events });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- ADMIN: Get all events (including unpublished) ---
router.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const events = stmts.getAllEvents.all();
    res.json({ success: true, data: events });
  } catch (err) {
    console.error('Admin get events error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- ADMIN: Create event ---
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { title_hr, title_en, description_hr, description_en, event_date, event_time, is_published } = req.body;

    if (!title_hr || !title_en) {
      return res.status(400).json({ error: 'Title is required in both languages.' });
    }
    if (!event_date || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return res.status(400).json({ error: 'Valid event date is required.' });
    }

    const result = stmts.insertEvent.run({
      title_hr: title_hr.trim(),
      title_en: title_en.trim(),
      description_hr: description_hr ? description_hr.trim() : null,
      description_en: description_en ? description_en.trim() : null,
      event_date,
      event_time: event_time || null,
      is_published: is_published !== undefined ? (is_published ? 1 : 0) : 1
    });

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- ADMIN: Update event ---
router.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = stmts.getEventById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const { title_hr, title_en, description_hr, description_en, event_date, event_time, is_published } = req.body;

    stmts.updateEvent.run({
      id,
      title_hr: (title_hr || existing.title_hr).trim(),
      title_en: (title_en || existing.title_en).trim(),
      description_hr: description_hr !== undefined ? (description_hr ? description_hr.trim() : null) : existing.description_hr,
      description_en: description_en !== undefined ? (description_en ? description_en.trim() : null) : existing.description_en,
      event_date: event_date || existing.event_date,
      event_time: event_time !== undefined ? (event_time || null) : existing.event_time,
      is_published: is_published !== undefined ? (is_published ? 1 : 0) : existing.is_published
    });

    res.json({ success: true, message: 'Event updated.' });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// --- ADMIN: Delete event ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = stmts.getEventById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    stmts.deleteEvent.run(id);
    res.json({ success: true, message: 'Event deleted.' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
