# Hospital Management Backend (Node + Express + MySQL)

## What is included
- server.js (Express app)
- db.js (MySQL connection using mysql2)
- routes/auth.js (register, login)
- routes/patients.js (basic patients endpoints)
- render.yaml (Render deployment config)
- .env.example

## Quick local setup
1. Copy `.env.example` to `.env` and fill DB credentials.
2. Install dependencies:
   ```
   npm install
   ```
3. Create the MySQL database and tables (see `schema.sql` below).
4. Start the server:
   ```
   npm start
   ```

## Database schema (MySQL)
Run these statements in your MySQL client:
```
CREATE DATABASE hospital_db;
USE hospital_db;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255),
  role ENUM('admin','doctor','patient') DEFAULT 'patient',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  age INT,
  phone VARCHAR(20),
  gender VARCHAR(10),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Deploy to Render
1. Push this repo to GitHub.
2. On Render, create a **New Web Service** and connect the repo.
3. Use the `render.yaml` or set:
   - Environment: Node
   - Start Command: `node server.js`
4. Add environment variables on Render (DB_HOST, DB_USER, DB_PASS, DB_NAME).
5. Deploy.
