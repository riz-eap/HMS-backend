// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const doctorsRoutes = require('./routes/doctors');
const patientsRoutes = require('./routes/patients');
const appointmentsRoutes = require('./routes/appointments');




const app = express(); // <- must be before using app

// JSON body parser
app.use(express.json());

// CORS - allow only your frontend origin if set, otherwise allow all (development)
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
}));

// Optional: serve static frontend if you keep front inside repo (comment/uncomment as needed)
// const staticPath = path.join(__dirname, 'public');
// app.use(express.static(staticPath));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointments', appointmentsRoutes);

// root health-check
app.get('/', (req, res) => {
  res.send('Hospital Management Backend is running');
});

// 404 handler
app.use((req, res) => res.status(404).send('Not Found'));

// Error handler (simple)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
