const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to connect to Supabase PostgreSQL.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true },
  max: Number(process.env.PG_POOL_MAX) || 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', error => {
  console.error('Unexpected idle PostgreSQL client error:', error);
});

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.postgres.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
  await pool.query(
    `INSERT INTO qc_units(code, name, active) VALUES
      ('mm', 'Millimet', 1),
      ('°C', 'Độ C', 1),
      ('s', 'Giây', 1),
      ('g/h', 'Gram/giờ', 1)
    ON CONFLICT(code) DO NOTHING`
  );
}

async function query(text, values = []) {
  return pool.query(text, values);
}

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('PostgreSQL transaction rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { pool, query, transaction, initializeDatabase, closeDatabase };
