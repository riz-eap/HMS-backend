// server.js - main entry
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');

const roomsRoutes = require('./routes/rooms');
const roomAssignmentsRoutes = require('./routes/room_assignments');
const staffRoutes = require('./routes/staff');
const medicinesRoutes = require('./routes/medicines');
const medicineIssuesRoutes = require('./routes/medicine_issues');
const patientHistoryRoutes = require('./routes/patient_history');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// root health
app.get('/', (req, res) => res.json({ message: 'HMS backend running' }));

// mount routes under /api
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);

app.use('/api/rooms', roomsRoutes);
app.use('/api/room_assignments', roomAssignmentsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/medicines', medicinesRoutes);
app.use('/api/medicine_issues', medicineIssuesRoutes);
app.use('/api/patient_history', patientHistoryRoutes);

// Generic 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
