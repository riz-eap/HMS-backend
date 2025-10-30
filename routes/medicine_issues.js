// routes/medicine_issues.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /medicine_issues
router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT mi.*, m.name as medicine_name, p.name as patient_name
      FROM medicine_issues mi
      LEFT JOIN medicines m ON m.id = mi.medicine_id
      LEFT JOIN patients p ON p.id = mi.patient_id
      ORDER BY mi.issued_at DESC
      LIMIT 200
    `);
    res.json(r.rows);
  } catch (err) {
    console.error('medicine_issues list err', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /medicine_issues - issue medicine (transaction: decrement stock and record)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { medicine_id, patient_id, quantity = 1, instructions, source_batch } = req.body;
  if (!medicine_id || !patient_id || quantity <= 0) return res.status(400).json({ error: 'medicine_id, patient_id and positive quantity required' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // check stock
    const m = await client.query('SELECT id, quantity FROM medicines WHERE id=$1 FOR UPDATE', [medicine_id]);
    if (!m.rows.length) throw new Error('Medicine not found');
    if (m.rows[0].quantity < quantity) throw new Error('Insufficient stock');

    // decrement
    await client.query('UPDATE medicines SET quantity = quantity - $1, updated_at = now() WHERE id=$2', [quantity, medicine_id]);

    // insert issue record
    const ins = await client.query(
      `INSERT INTO medicine_issues (medicine_id, patient_id, issued_by, quantity, instructions, issued_at, source_batch, notes)
       VALUES ($1,$2,$3,$4,$5,now(),$6,$7) RETURNING *`,
      [medicine_id, patient_id, req.user.id, quantity, instructions || null, source_batch || null, null]
    );

    await client.query('COMMIT');
    res.json(ins.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('issue medicine err', err);
    res.status(400).json({ error: err.message || 'Failed to issue medicine' });
  } finally {
    client.release();
  }
});

module.exports = router;
