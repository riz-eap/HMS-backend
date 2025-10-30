// routes/rooms.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /rooms
router.get('/', authMiddleware, async (req, res) => {
  try {
    // join to optionally get patient name
    const r = await db.query(`
      SELECT r.*, p.name as current_patient_name
      FROM rooms r
      LEFT JOIN patients p ON p.id = r.current_patient_id
      ORDER BY r.room_number
    `);
    res.json(r.rows);
  } catch (err) {
    console.error('rooms list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /rooms (create room) - admin/staff allowed
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { room_number, ward, bed_label, room_type, notes } = req.body;
    const r = await db.query(
      `INSERT INTO rooms (room_number, ward, bed_label, room_type, notes, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
      [room_number, ward, bed_label, room_type, notes]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('create room err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /rooms/:id/vacate - vacate room (marks vacated, clears current_patient)
router.post('/:id/vacate', authMiddleware, requireRole('admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const roomId = req.params.id;

    // get current assignment id
    const roomR = await client.query('SELECT current_assignment_id, current_patient_id FROM rooms WHERE id=$1 FOR UPDATE', [roomId]);
    if (!roomR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }
    const { current_assignment_id, current_patient_id } = roomR.rows[0];

    // set vacated_at on assignment if exists
    if (current_assignment_id) {
      await client.query('UPDATE room_assignments SET vacated_at = now() WHERE id = $1', [current_assignment_id]);
    }

    // update room to free
    await client.query('UPDATE rooms SET status = $1, current_patient_id = NULL, current_assignment_id = NULL, updated_at = now() WHERE id=$2', ['free', roomId]);

    await client.query('COMMIT');
    res.json({ message: 'Room vacated' });
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('vacate err', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
