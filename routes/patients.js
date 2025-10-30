// routes/patients.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT id, name, email, phone FROM patients ORDER BY id DESC');
    res.json(r.rows);
  } catch (err) {
    console.error('patients list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM patients WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Patient not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('patient get err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
