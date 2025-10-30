// routes/medicines.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /medicines
router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM medicines ORDER BY name');
    res.json(r.rows);
  } catch (err) {
    console.error('medicines list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /medicines
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, brand, batch_no, expiry_date, quantity = 0, unit, min_threshold, location } = req.body;
    const r = await db.query(
      `INSERT INTO medicines (name, brand, batch_no, expiry_date, quantity, unit, min_threshold, location, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING *`,
      [name, brand, batch_no, expiry_date || null, quantity, unit || 'tablet', min_threshold || 0, location || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('medicines create err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM medicines WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('medicines delete err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
