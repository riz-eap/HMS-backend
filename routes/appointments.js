// routes/appointments.js
// Complete, robust appointments router.
// - Accepts either `datetime` or `appointment_date` in requests (normalizes to `datetime` column).
// - Validates patient_id and doctor_id when provided (returns 400 if an id is supplied but not found).
// - Good error responses and status codes.
// - Uses PostgreSQL pool from ../db

const express = require('express');
const router = express.Router();
const pool = require('../db');

// helper: check if a record exists in a table by id
async function existsIn(table, id) {
  if (!id) return false;
  const q = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
  return q.rowCount > 0;
}

// GET /api/appointments
router.get('/', async (req, res, next) => {
  try {
    const q = await pool.query(`
      SELECT a.id, a.patient_id, a.doctor_id, a.datetime, a.status, a.notes,
             p.name AS patient_name, d.name AS doctor_name, a.created_at
      FROM appointments a
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.id = a.doctor_id
      ORDER BY a.created_at DESC
    `);
    res.json(q.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Appointment not found' });
    res.json(q.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments
router.post('/', async (req, res, next) => {
  try {
    // Accept either `datetime` or `appointment_date`
    const {
      patient_id,
      doctor_id,
      datetime,
      appointment_date,
      status,
      notes
    } = req.body;

    // Normalize date/time field: prefer datetime then appointment_date
    const dt = datetime || appointment_date || null;

    // If patient_id or doctor_id provided, validate they exist to avoid FK errors
    if (patient_id) {
      const ok = await existsIn('patients', patient_id);
      if (!ok) return res.status(400).json({ error: `patient_id ${patient_id} not found` });
    }
    if (doctor_id) {
      const ok = await existsIn('doctors', doctor_id);
      if (!ok) return res.status(400).json({ error: `doctor_id ${doctor_id} not found` });
    }

    const q = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, datetime, status, notes, created_at)
       VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
      [patient_id || null, doctor_id || null, dt || null, status || 'scheduled', notes || null]
    );

    res.status(201).json(q.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/appointments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const {
      patient_id,
      doctor_id,
      datetime,
      appointment_date,
      status,
      notes
    } = req.body;

    // Normalize date/time field
    const dt = datetime || appointment_date || null;

    // Validate existence of appointment
    const check = await pool.query('SELECT 1 FROM appointments WHERE id=$1', [req.params.id]);
    if (!check.rowCount) return res.status(404).json({ error: 'Appointment not found' });

    // Validate patient/doctor ids (if provided)
    if (patient_id) {
      const ok = await existsIn('patients', patient_id);
      if (!ok) return res.status(400).json({ error: `patient_id ${patient_id} not found` });
    }
    if (doctor_id) {
      const ok = await existsIn('doctors', doctor_id);
      if (!ok) return res.status(400).json({ error: `doctor_id ${doctor_id} not found` });
    }

    // Update using COALESCE so omitted fields are preserved
    await pool.query(
      `UPDATE appointments
         SET patient_id = COALESCE($1, patient_id),
             doctor_id  = COALESCE($2, doctor_id),
             datetime   = COALESCE($3, datetime),
             status     = COALESCE($4, status),
             notes      = COALESCE($5, notes),
             updated_at = now()
       WHERE id = $6`,
      [patient_id || null, doctor_id || null, dt || null, status || null, notes || null, req.params.id]
    );

    const q = await pool.query('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    res.json(q.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const q = await pool.query('DELETE FROM appointments WHERE id=$1 RETURNING *', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Appointment not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
