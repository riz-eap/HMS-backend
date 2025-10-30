// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Register - you may already have this; kept minimal and safe
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'patient' } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    // prevent duplicates
    const existing = await db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already exists' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password, role, created_at) VALUES ($1,$2,$3,$4,now()) RETURNING id, name, email, role`,
      [name || null, email, hashed, role]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Registered', token, user });
  } catch (err) {
    console.error('register err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const result = await db.query('SELECT id, name, email, password, role FROM users WHERE lower(email)=lower($1)', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    // remove password from response
    delete user.password;
    res.json({ message: 'Login successful', token, user });
  } catch (err) {
    console.error('login err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// /auth/me - verify token and return user
const { authMiddleware } = require('../middleware/auth');
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT id, name, email, role FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: r.rows[0] });
  } catch (err) {
    console.error('me err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
