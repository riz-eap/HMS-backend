// routes/room_assignments.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /room_assignments
router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT ra.*, r.room_number, p.name as patient_name
      FROM room_assignments ra
      LEFT JOIN rooms r ON r.id = ra.room_id
      LEFT JOIN patients p ON p.id = ra.patient_id
      ORDER BY ra.admitted_at DESC
      LIMIT 200
    `);
    res.json(r.rows);
  } catch (err) {
    console.error('room_assignments list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /room_assignments - assign a patient to a room (transactional)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { room_id, patient_id, reason } = req.body;
  if (!room_id || !patient_id) return res.status(400).json({ error: 'room_id and patient_id required' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // lock room
    const r = await client.query('SELECT id, status FROM rooms WHERE id=$1 FOR UPDATE', [room_id]);
    if (!r.rows.length) throw new Error('Room not found');
    if (r.rows[0].status === 'occupied') throw new Error('Room already occupied');

    // insert assignment
    const ins = await client.query(
      `INSERT INTO room_assignments (room_id, patient_id, admitted_at, assigned_by, reason, created_at) VALUES ($1,$2,now(),$3,$4,now()) RETURNING id`,
      [room_id, patient_id, req.user.id, reason || null]
    );

    const assignId = ins.rows[0].id;

    // update room to occupied with assignment
    await client.query('UPDATE rooms SET status=$1, current_patient_id=$2, current_assignment_id=$3, updated_at = now() WHERE id=$4', ['occupied', patient_id, assignId, room_id]);

    await client.query('COMMIT');
    res.json({ message: 'Assigned', assignment_id: assignId });
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('assign err', err);
    res.status(400).json({ error: err.message || 'Failed to assign' });
  } finally {
    client.release();
  }
});

module.exports = router;
