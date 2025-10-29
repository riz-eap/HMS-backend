// routes/patients.js
const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM patients ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const { name, age, phone, gender, address } = req.body;
  try {
    await db.query(
      'INSERT INTO patients (name, age, phone, gender, address) VALUES ($1, $2, $3, $4, $5)',
      [name, age, phone, gender, address]
    );
    res.json({ message: 'Patient added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
