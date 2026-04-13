const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let role = null;
    let storedHash = null;

    if (normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase()) {
      role = 'admin';
      storedHash = process.env.ADMIN_PASSWORD_HASH;
    } else if (normalizedEmail === process.env.STAFF_EMAIL?.toLowerCase()) {
      role = 'staff';
      storedHash = process.env.STAFF_PASSWORD_HASH;
    }

    if (!role || !storedHash) {
      // Constant-time response to prevent email enumeration
      await bcrypt.hash('dummy', 12);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ role }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      success: true,
      token,
      role,
      expiresIn: 8 * 60 * 60
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ role: req.user.role });
});

module.exports = router;
