// server.js — HMS backend single-file implementation
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Config from env ---
const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret';

// --- Validate environment ---
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

// --- Postgres pool (Render requires ssl with rejectUnauthorized:false) ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- Helper functions ---
const query = (text, params) => pool.query(text, params);

// Auth middleware
function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if ((req.user.role || '').toLowerCase() !== String(role).toLowerCase()) {
      // allow admin to access everything
      if ((req.user.role || '').toLowerCase() === 'admin') return next();
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'patient' } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // check existing
    const existing = await query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (name, email, password, role, created_at) VALUES ($1,$2,$3,$4,now()) RETURNING id, name, email, role, created_at',
      [name || null, email, hashed, role]
    );
    const user = result.rows[0];

    // If role is patient and your patients table should have a row, create it (best-effort)
    if (role.toLowerCase() === 'patient') {
      try {
        await query('INSERT INTO patients (name, age, phone, gender, address, created_at) VALUES ($1, NULL, NULL, NULL, NULL, now())', [name || email]);
      } catch (e) {
        // ignore if patients schema differs
      }
    }

    res.status(201).json({ message: 'Registered', user });
  } catch (err) {
    console.error('POST /api/auth/register error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await query('SELECT id, name, email, password, role FROM users WHERE lower(email)=lower($1)', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    // return safe user object (without password)
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ message: 'Login successful', token, user: safeUser });
  } catch (err) {
    console.error('POST /api/auth/login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('GET /api/auth/me error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- USERS (admin) ---
app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/users', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/users/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, role } = req.body || {};
    await query('UPDATE users SET name=$1, role=$2 WHERE id=$3', [name || null, role || 'patient', req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PUT /api/users/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/users/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- PATIENTS ---
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, age, phone, gender, address, created_at FROM patients ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/patients', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, age, phone, gender, address, created_at FROM patients WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/patients/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/patients', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, age, phone, gender, address } = req.body || {};
    const { rows } = await query('INSERT INTO patients (name, age, phone, gender, address, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id, name, age, phone, gender, address, created_at', [name, age || null, phone || null, gender || null, address || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/patients', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const { name, age, phone, gender, address } = req.body || {};
    await query('UPDATE patients SET name=$1, age=$2, phone=$3, gender=$4, address=$5 WHERE id=$6', [name, age || null, phone || null, gender || null, address || null, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PUT /api/patients/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/patients/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM patients WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/patients/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- DOCTORS ---
app.get('/api/doctors', authenticateToken, async (req, res) => {
  try {
    // try to select fields commonly present; if user_id exists return it
    const { rows } = await query('SELECT id, user_id, name, email, phone, specialty, qualifications, bio, created_at FROM doctors ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/doctors', err);
    // fallback: if table differs, return empty array
    return res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/doctors/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, user_id, name, email, phone, specialty, qualifications, bio, created_at FROM doctors WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/doctors/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/doctors', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { user_id, name, email, phone, specialty, qualifications, bio } = req.body || {};
    const { rows } = await query('INSERT INTO doctors (user_id, name, email, phone, specialty, qualifications, bio, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id, user_id, name, email, phone, specialty, qualifications, bio, created_at', [user_id || null, name || null, email || null, phone || null, specialty || null, qualifications || null, bio || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/doctors', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/doctors/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phone, specialty, qualifications, bio } = req.body || {};
    await query('UPDATE doctors SET name=$1, email=$2, phone=$3, specialty=$4, qualifications=$5, bio=$6 WHERE id=$7', [name || null, email || null, phone || null, specialty || null, qualifications || null, bio || null, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PUT /api/doctors/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/doctors/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM doctors WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/doctors/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- APPOINTMENTS ---
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, patient_id, patient_name, doctor_id, doctor_name, scheduled_at, status, created_at FROM appointments ORDER BY scheduled_at DESC NULLS LAST');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/appointments', err);
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { patient_id, patient_name, doctor_id, doctor_name, scheduled_at, status } = req.body || {};
    const { rows } = await query('INSERT INTO appointments (patient_id, patient_name, doctor_id, doctor_name, scheduled_at, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *', [patient_id||null, patient_name||null, doctor_id||null, doctor_name||null, scheduled_at||null, status||'scheduled']);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/appointments', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const { scheduled_at, status } = req.body || {};
    await query('UPDATE appointments SET scheduled_at=$1, status=$2 WHERE id=$3', [scheduled_at||null, status||null, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PUT /api/appointments/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/appointments/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/appointments/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ROOMS ---
app.get('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, room_number, ward, bed_label, room_type, status, current_patient_id, current_patient_name, created_at FROM rooms ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/rooms', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/rooms', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { room_number, ward, bed_label, room_type } = req.body || {};
    const { rows } = await query('INSERT INTO rooms (room_number, ward, bed_label, room_type, status, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *', [room_number||null, ward||null, bed_label||null, room_type||'general', 'free']);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/rooms', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/rooms/:id/vacate', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // clear current patient
    await query('UPDATE rooms SET status=$1, current_patient_id=NULL, current_patient_name=NULL WHERE id=$2', ['free', req.params.id]);
    // create room_assignments vacated record (optional)
    await query('INSERT INTO room_assignments (room_id, patient_id, admitted_at, vacated_at, created_at) VALUES ($1, NULL, NULL, now(), now())', [req.params.id]);
    res.json({ message: 'Vacated' });
  } catch (err) {
    console.error('POST /api/rooms/:id/vacate', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ROOM ASSIGNMENTS ---
app.get('/api/room_assignments', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, room_id, room_number, patient_id, patient_name, admitted_at, vacated_at, created_at FROM room_assignments ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/room_assignments', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/room_assignments', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { room_id, patient_id, reason } = req.body || {};
    // load room and patient names for readability
    const room = (await query('SELECT room_number FROM rooms WHERE id=$1', [room_id])).rows[0];
    const patient = (await query('SELECT name FROM patients WHERE id=$1', [patient_id])).rows[0];
    await query('UPDATE rooms SET status=$1, current_patient_id=$2, current_patient_name=$3 WHERE id=$4', ['occupied', patient_id || null, (patient && patient.name) || null, room_id]);
    const { rows } = await query('INSERT INTO room_assignments (room_id, room_number, patient_id, patient_name, admitted_at, reason, created_at) VALUES ($1,$2,$3,$4,now(),$5,now()) RETURNING *', [room_id, (room && room.room_number) || null, patient_id||null, (patient && patient.name) || null, reason||null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/room_assignments', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- MEDICINES ---
app.get('/api/medicines', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, batch_no, quantity, expiry_date, min_threshold, created_at FROM medicines ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/medicines', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/medicines', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, batch_no, quantity, expiry_date, min_threshold } = req.body || {};
    const { rows } = await query('INSERT INTO medicines (name, batch_no, quantity, expiry_date, min_threshold, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *', [name||null, batch_no||null, quantity||0, expiry_date||null, min_threshold||null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/medicines', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/medicines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, batch_no, quantity, expiry_date, min_threshold } = req.body || {};
    await query('UPDATE medicines SET name=$1, batch_no=$2, quantity=$3, expiry_date=$4, min_threshold=$5 WHERE id=$6', [name||null, batch_no||null, quantity||0, expiry_date||null, min_threshold||null, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PUT /api/medicines/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/medicines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM medicines WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/medicines/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- MEDICINE ISSUES ---
app.get('/api/medicine_issues', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, medicine_id, medicine_name, patient_id, patient_name, quantity, issued_by, issued_by_name, issued_at, created_at FROM medicine_issues ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/medicine_issues', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/medicine_issues', authenticateToken, async (req, res) => {
  try {
    const { medicine_id, patient_id, quantity = 1, instructions } = req.body || {};
    // fetch medicine & patient
    const med = (await query('SELECT id, name, quantity FROM medicines WHERE id=$1', [medicine_id])).rows[0];
    const patient = (await query('SELECT id, name FROM patients WHERE id=$1', [patient_id])).rows[0];
    if (!med) return res.status(400).json({ error: 'Medicine not found' });

    // update stock (best-effort; allow negative if you want otherwise check)
    const newQty = Math.max(0, (med.quantity || 0) - Number(quantity));
    await query('UPDATE medicines SET quantity=$1 WHERE id=$2', [newQty, medicine_id]);

    const { rows } = await query('INSERT INTO medicine_issues (medicine_id, medicine_name, patient_id, patient_name, quantity, instructions, issued_by, issued_by_name, issued_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *', [medicine_id, med.name, patient_id||null, (patient && patient.name) || null, quantity, instructions||null, req.user.id, req.user.name || req.user.email]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/medicine_issues', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- PATIENT HISTORY ---
app.get('/api/patient_history', authenticateToken, async (req, res) => {
  try {
    const pid = req.query.patient_id;
    if (!pid) {
      const { rows } = await query('SELECT id, patient_id, patient_name, record_type, title, body, created_at FROM patient_history ORDER BY created_at DESC LIMIT 200');
      return res.json(rows);
    }
    const { rows } = await query('SELECT id, patient_id, patient_name, record_type, title, body, created_at FROM patient_history WHERE patient_id=$1 ORDER BY created_at DESC', [pid]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/patient_history', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/patient_history', authenticateToken, async (req, res) => {
  try {
    const { patient_id, record_type, title, body } = req.body || {};
    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });
    // fetch patient name if possible
    const p = (await query('SELECT name FROM patients WHERE id=$1', [patient_id])).rows[0];
    const { rows } = await query('INSERT INTO patient_history (patient_id, patient_name, record_type, title, body, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *', [patient_id, (p && p.name) || null, record_type || 'note', title || null, body || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/patient_history', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ADMISSIONS ---
app.get('/api/admissions', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, patient_id, patient_name, admitted_at, discharged_at, reason, created_at FROM admissions ORDER BY admitted_at DESC NULLS LAST');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/admissions', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admissions', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { patient_id, reason } = req.body || {};
    const p = (await query('SELECT name FROM patients WHERE id=$1', [patient_id])).rows[0];
    const { rows } = await query('INSERT INTO admissions (patient_id, patient_name, admitted_at, reason, created_at) VALUES ($1,$2,now(),$3,now()) RETURNING *', [patient_id, (p && p.name) || null, reason || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/admissions', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- TREATMENTS ---
app.get('/api/treatments', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, patient_id, patient_name, doctor_id, doctor_name, description, created_at FROM treatments ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/treatments', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/treatments', authenticateToken, async (req, res) => {
  try {
    const { patient_id, doctor_id, description } = req.body || {};
    const p = (await query('SELECT name FROM patients WHERE id=$1', [patient_id])).rows[0];
    const d = (await query('SELECT name FROM doctors WHERE id=$1', [doctor_id])).rows[0];
    const { rows } = await query('INSERT INTO treatments (patient_id, patient_name, doctor_id, doctor_name, description, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *', [patient_id, (p && p.name) || null, doctor_id, (d && d.name) || null, description || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/treatments', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- PATIENTS SUMMARY ---
app.get('/api/patients_summary', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, patient_id, patient_name, summary_text, created_at FROM patients_summary ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/patients_summary', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/patients_summary', authenticateToken, async (req, res) => {
  try {
    const { patient_id, summary_text } = req.body || {};
    const p = (await query('SELECT name FROM patients WHERE id=$1', [patient_id])).rows[0];
    const { rows } = await query('INSERT INTO patients_summary (patient_id, patient_name, summary_text, created_at) VALUES ($1,$2,$3,now()) RETURNING *', [patient_id, (p && p.name) || null, summary_text || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/patients_summary', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- STAFF ---
app.get('/api/staff', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, email, phone, role, department, created_at FROM staff ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/staff', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/staff', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phone, role: staffRole, department } = req.body || {};
    const { rows } = await query('INSERT INTO staff (name, email, phone, role, department, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *', [name||null, email||null, phone||null, staffRole||null, department||null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/staff', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/staff/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM staff WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /api/staff/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Health check ---
app.get('/', (req, res) => res.send('HMS backend running'));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`Available at / (root) and /api/*`);
});
