// routes/staff.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM staff ORDER BY id DESC');
    res.json(r.rows);
  } catch (err) {
    console.error('staff list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phone, role, department } = req.body;
    const r = await db.query(
      `INSERT INTO staff (name, email, phone, role, department, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
      [name, email, phone, role, department]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('staff create err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM staff WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('staff delete err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
