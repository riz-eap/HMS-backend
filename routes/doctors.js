// routes/doctors.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/doctors
router.get('/', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT id, name, email, phone, specialty, created_at FROM doctors ORDER BY created_at DESC');
    res.json(q.rows);
  } catch (err) { next(err); }
});

// GET /api/doctors/:id
router.get('/:id', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT * FROM doctors WHERE id=$1', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/doctors
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, specialty, qualifications, bio } = req.body;
    const q = await pool.query(
      `INSERT INTO doctors (name,email,phone,specialty,qualifications,bio) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name,email,phone,specialty,qualifications,bio]
    );
    res.status(201).json(q.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/doctors/:id
router.put('/:id', async (req, res, next) => {
  try {
    const fields = ['name','email','phone','specialty','qualifications','bio'];
    const vals = fields.map(f => req.body[f] ?? null);
    // simple update using COALESCE
    await pool.query(
      `UPDATE doctors SET name = COALESCE($1,name), email = COALESCE($2,email), phone = COALESCE($3,phone), specialty = COALESCE($4,specialty), qualifications = COALESCE($5,qualifications), bio = COALESCE($6,bio) WHERE id=$7`,
      [...vals, req.params.id]
    );
    const q = await pool.query('SELECT * FROM doctors WHERE id=$1', [req.params.id]);
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/doctors/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM doctors WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
