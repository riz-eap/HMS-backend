// server.js - Express backend (CommonJS)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');

const app = express();
app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);

// Simple root route
app.get('/', (req, res) => {
  res.send('Hospital Management Backend is running');
});

// Serve frontend static files if present in ../frontend or repo root 'public'
// Uncomment and adjust if you want Express to serve the frontend
/*
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});
*/

const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=> console.log(`Server started on port ${PORT}`));
