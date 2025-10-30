// routes/patient_history.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /patient_history?patient_id=...
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id ? 'SELECT * FROM patient_history WHERE patient_id=$1 ORDER BY created_at DESC' : 'SELECT * FROM patient_history ORDER BY created_at DESC LIMIT 200';
    const params = patient_id ? [patient_id] : [];
    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error('patient_history list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /patient_history
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { patient_id, appointment_id, record_type='note', title, body, tags } = req.body;
    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });
    const r = await db.query(
      `INSERT INTO patient_history (patient_id, appointment_id, recorded_by, record_type, title, body, tags, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,
      [patient_id, appointment_id || null, req.user.id, record_type, title || null, body || null, tags || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('patient_history create err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
