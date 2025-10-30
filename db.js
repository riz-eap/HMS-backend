// db.js
// Robust pg Pool for Render / local dev
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL ||
  process.env.PG_CONNECTION ||
  (process.env.PGHOST ? 
    `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}` 
    : null);

if (!connectionString) {
  console.error('ERROR: No DATABASE_URL / PG_CONNECTION / PGHOST found in environment.');
  console.error('Set DATABASE_URL to: postgresql://user:pass@host:port/dbname');
  // throw to fail fast on startup
  throw new Error('Database connection string not configured');
}

const pool = new Pool({
  connectionString,
  // Render requires TLS; in many environments rejectUnauthorized=false is fine.
  ssl: { rejectUnauthorized: false }
});

// Optional: simple connection test at startup (logs useful on Render)
pool.connect()
  .then(client => {
    return client.query('SELECT 1')
      .then(() => {
        client.release();
        console.log('✅ Postgres connected');
      })
      .catch(err => {
        client.release();
        console.error('Postgres test query failed:', err);
      });
  })
  .catch(err => {
    console.error('Postgres connection failed:', err);
  });

module.exports = pool;
