// routes/users.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // your db pool module

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(q.rows);
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, role, password } = req.body;
    const q = await pool.query(
      `INSERT INTO users (name, email, role, password) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at`,
      [name, email, role || 'patient', password || null]
    );
    res.status(201).json(q.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, role } = req.body;
    await pool.query(
      `UPDATE users SET name = COALESCE($1,name), email = COALESCE($2,email), role = COALESCE($3,role) WHERE id=$4`,
      [name, email, role, req.params.id]
    );
    const q = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.params.id]);
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
