// db.js — PostgreSQL connection using 'pg'
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'hospital_db',
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
