// routes/appointments.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

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
  } catch (err) { next(err); }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const q = await pool.query('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/appointments
router.post('/', async (req, res, next) => {
  try {
    const { patient_id, doctor_id, datetime, status, notes } = req.body;
    const q = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, datetime, status, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [patient_id || null, doctor_id || null, datetime || null, status || 'scheduled', notes || null]
    );
    res.status(201).json(q.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/appointments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { patient_id, doctor_id, datetime, status, notes } = req.body;
    await pool.query(
      `UPDATE appointments SET patient_id = COALESCE($1, patient_id), doctor_id = COALESCE($2,doctor_id), datetime = COALESCE($3,datetime), status = COALESCE($4,status), notes = COALESCE($5,notes) WHERE id=$6`,
      [patient_id, doctor_id, datetime, status, notes, req.params.id]
    );
    const q = await pool.query('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    res.json(q.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
