require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { DB_PATH, UPLOADS_DIR } = require('../database/paths');
const { isR2Configured, uploadObject, getPublicUrl } = require('../lib/r2Storage');

const TABLES = [
  'customers',
  'users',
  'app_deleted_purchase_orders',
  'purchase_orders',
  'burn_tests',
  'burn_test_photos',
  'burn_test_videos',
  'burn_test_logs',
  'products',
  'customer_check_records',
  'customer_check_photos',
  'customer_check_slots',
  'app_settings',
  'qc_standards',
  'audit_logs',
  'sample_burn_tests',
  'sample_burn_test_photos',
  'sample_burn_cycles',
  'qc_units',
  'periodic_templates',
  'periodic_template_items',
  'periodic_checks',
  'periodic_check_items'
];
const URL_COLUMNS = new Set(['file_url', 'image_url']);

function walkFiles(directory, root = directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Uploads folder contains a symbolic link: ${fullPath}`);
    if (entry.isDirectory()) return walkFiles(fullPath, root);
    if (!entry.isFile()) return [];
    return [{
      fullPath,
      key: path.relative(root, fullPath).split(path.sep).join('/')
    }];
  });
}

function publicMediaUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return value;
  return getPublicUrl(value.slice('/uploads/'.length));
}

function normalizeRow(table, row, uploadsRoot) {
  const normalized = { ...row };
  for (const column of URL_COLUMNS) {
    if (column in normalized) normalized[column] = publicMediaUrl(normalized[column]);
  }

  if (table === 'app_settings' && normalized.key === 'report_logo_path' && normalized.value) {
    const storedPath = String(normalized.value);
    const resolved = path.resolve(storedPath);
    const relative = path.relative(path.resolve(uploadsRoot), resolved);
    if (relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      normalized.value = getPublicUrl(relative.split(path.sep).join('/'));
    }
  }
  return normalized;
}

function readSqliteRows(sqlite, table) {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) return [];
  return sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
}

function assertNoUnknownTables(sqlite) {
  const known = new Set(TABLES);
  const unknown = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(row => row.name).filter(name => !known.has(name));
  const populated = [];
  for (const table of unknown) {
    const name = table.replace(/"/g, '""');
    const count = sqlite.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count;
    if (Number(count)) populated.push(`${table}=${count}`);
  }
  if (populated.length) {
    throw new Error(`SQLite contains tables not covered by this migration: ${populated.join(', ')}.`);
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm'
  })[extension] || 'application/octet-stream';
}

async function assertCloudDatabaseEmpty(pool) {
  const counts = await Promise.all(TABLES.map(async table => {
    const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    return [table, Number(rows[0].count)];
  }));
  const populated = counts.filter(([, count]) => count > 0);
  if (populated.length) {
    throw new Error(`Supabase database is not empty. Import stopped to prevent duplicates: ${populated.map(([table, count]) => `${table}=${count}`).join(', ')}`);
  }
}

async function importRows(sqlite, pool) {
  const rowCounts = {};
  await pool.query('BEGIN');
  try {
    for (const table of TABLES) {
      const rows = readSqliteRows(sqlite, table);
      if (!rows.length) continue;

      const columnsResult = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
        [table]
      );
      const targetColumns = new Set(columnsResult.rows.map(column => column.column_name));
      const sourceColumns = Object.keys(rows[0]);
      const missingColumns = sourceColumns.filter(column => !targetColumns.has(column));
      if (missingColumns.length) {
        throw new Error(`PostgreSQL table "${table}" is missing SQLite columns: ${missingColumns.join(', ')}.`);
      }
      const columns = sourceColumns;
      if (!columns.length) throw new Error(`No matching PostgreSQL columns found for "${table}".`);

      for (const sourceRow of rows) {
        const row = normalizeRow(table, sourceRow, UPLOADS_DIR);
        const values = columns.map(column => row[column] === undefined ? null : row[column]);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const quotedColumns = columns.map(column => `"${column}"`).join(', ');
        const overrideIdentity = columns.includes('id') ? ' OVERRIDING SYSTEM VALUE' : '';
        await pool.query(
          `INSERT INTO "${table}" (${quotedColumns})${overrideIdentity} VALUES (${placeholders})`,
          values
        );
      }
      rowCounts[table] = rows.length;
    }

    for (const table of TABLES) {
      if (!readSqliteRows(sqlite, table).some(row => Object.prototype.hasOwnProperty.call(row, 'id'))) continue;
      await pool.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "${table}"`,
        [table]
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  return rowCounts;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the Supabase PostgreSQL connection string.');
  if (!isR2Configured()) throw new Error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET before migrating media.');
  if (!process.env.R2_PUBLIC_URL) throw new Error('Set R2_PUBLIC_URL to the public custom domain or public.dev URL for the bucket.');
  if (!fs.existsSync(DB_PATH)) throw new Error(`SQLite database was not found at ${DB_PATH}. Set DB_PATH to the current source database.`);

  const { initializeDatabase, closeDatabase } = require('../database/postgres');
  const sqlite = new DatabaseSync(DB_PATH, { readOnly: true });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true }
  });

  try {
    sqlite.exec('BEGIN');
    sqlite.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
    assertNoUnknownTables(sqlite);
    await initializeDatabase();
    await assertCloudDatabaseEmpty(pool);

    const files = walkFiles(UPLOADS_DIR);
    console.log(`Uploading ${files.length} files from ${UPLOADS_DIR} to Cloudflare R2...`);
    for (const file of files) {
      await uploadObject(
        file.key,
        fs.createReadStream(file.fullPath),
        contentTypeFor(file.fullPath),
        fs.statSync(file.fullPath).size
      );
    }
    console.log('R2 upload finished. Importing SQLite rows into Supabase...');
    const counts = await importRows(sqlite, pool);
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
    console.log(`Migration completed. Uploaded ${files.length} media files.`);
  } finally {
    try { sqlite.exec('ROLLBACK'); } catch (_) {}
    sqlite.close();
    await pool.end();
    await closeDatabase();
  }
}

main().catch(error => {
  console.error('SQLite to Supabase/R2 migration failed:', error);
  process.exitCode = 1;
});
