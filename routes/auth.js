// routes/auth.js
// Authentication routes (register, login, me)
// Adds JWT token on successful login
const express = require('express');
const router = express.Router();
const pool = require('../db'); // expects module.exports = pool from db.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Config
const JWT_SECRET = process.env.JWT_SECRET || '3b5fc14c2e6bdf29f91a57c7e1b612d8f6aa!t@r5D7e';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '10d'; // token lifetime

// Helper: sign a token for a user object (keep minimal payload)
function signToken(user) {
  const payload = {
    id: user.id,
    role: user.role,
    email: user.email
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Optional middleware to protect routes (exported if you want use elsewhere)
function authenticateToken(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- REGISTER ----------
/*
 Expected JSON body: { name, email, password, role }
 Behavior:
  - hashes password with bcrypt
  - inserts into users table
  - returns created user object (without password)
*/
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    // Normalize email
    const emailNorm = String(email).trim().toLowerCase();

    // Check if user exists
    const { rowCount: existing } = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [emailNorm]);
    if (existing) return res.status(409).json({ error: 'User with that email already exists' });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    // Insert user
    const q = await pool.query(
      `INSERT INTO users (name, email, password, role, created_at)
       VALUES ($1,$2,$3,$4, NOW())
       RETURNING id, name, email, role, created_at`,
      [name || null, emailNorm, hashed, role || 'patient']
    );

    const user = q.rows[0];
    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    console.error('Register error', err);
    next(err);
  }
});

// ---------- LOGIN ----------
/*
 Expected JSON body: { email, password }
 Behavior:
  - finds user by email
  - compares hashed password
  - on success returns { message, token, user }
  - on failure returns 401
*/
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const emailNorm = String(email).trim().toLowerCase();
    const q = await pool.query('SELECT id, name, email, password, role, created_at FROM users WHERE lower(email) = $1', [emailNorm]);

    if (!q.rowCount) return res.status(401).json({ message: 'Invalid credentials' });

    const user = q.rows[0];

    // password may be null if external auth; handle safely
    if (!user.password) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Build safe user object to return (exclude password)
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    };

    // Sign token
    const token = signToken(safeUser);

    // Respond with token and user
    return res.json({
      message: 'Login successful',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error', err);
    next(err);
  }
});

// ---------- OPTIONAL: get current user ----------
/*
 GET /api/auth/me
 Requires Authorization: Bearer <token>
*/
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const id = req.user && req.user.id;
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const q = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [id]);
    if (!q.rowCount) return res.status(404).json({ error: 'User not found' });

    res.json({ user: q.rows[0] });
  } catch (err) {
    console.error('Me route error', err);
    next(err);
  }
});

// Export middleware in case other modules want it
module.exports = router;
module.exports.authenticateToken = authenticateToken;
