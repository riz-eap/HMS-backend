// db.js
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/hms_db_za2u';

const poolConfig = {
  connectionString,
  // If running on Render or other managed PG which requires SSL:
  ssl: (process.env.NODE_ENV === 'production' || connectionString.includes('postgres')) ? { rejectUnauthorized: false } : false,
  // nice defaults:
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
