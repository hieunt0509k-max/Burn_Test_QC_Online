// Lớp database dùng SQLite built-in của Node (node:sqlite) — không cần cài native
// module nào (tránh lỗi thiếu Visual Studio Build Tools khi cài trên Windows).
// Yêu cầu Node >= 22.5.0.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'burn_test.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id, po_number)
);

CREATE TABLE IF NOT EXISTS burn_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  diameter_mm REAL,
  height_mm REAL,
  fragrance TEXT,
  color TEXT,
  wick TEXT,
  temperature_c REAL,
  test_date TEXT,
  test_time TEXT,
  start_datetime TEXT,
  end_datetime TEXT,
  total_burn_time TEXT,
  tester TEXT,
  approver TEXT,
  result TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
 
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS burn_test_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  burn_test_id INTEGER NOT NULL REFERENCES burn_tests(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(burn_test_id, slot)
);

CREATE TABLE IF NOT EXISTS burn_test_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  burn_test_id INTEGER NOT NULL REFERENCES burn_tests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_check_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  customer_code TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(purchase_order_id, customer_code)
);

CREATE TABLE IF NOT EXISTS customer_check_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL REFERENCES customer_check_records(id) ON DELETE CASCADE,
  burn_hours REAL NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_check_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL REFERENCES customer_check_records(id) ON DELETE CASCADE,
  burn_hours REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(record_id, burn_hours)
);

CREATE TABLE IF NOT EXISTS burn_test_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  burn_test_id INTEGER NOT NULL REFERENCES burn_tests(id) ON DELETE CASCADE,
  time_label TEXT NOT NULL,
  wick_status TEXT NOT NULL,
  flame_status TEXT NOT NULL,
  wick_height_mm REAL NOT NULL,
  vessel_condition TEXT NOT NULL,
  temperature_c REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  customer_po_code TEXT,
  customer_code TEXT,
  size TEXT,
  weight REAL,
  wick TEXT,
  color TEXT,
  fragrance TEXT,
  diameter_mm REAL,
  height_mm REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_po_customer ON purchase_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_test_po ON burn_tests(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_photo_test ON burn_test_photos(burn_test_id);
CREATE INDEX IF NOT EXISTS idx_customer_check_record ON customer_check_photos(record_id, burn_hours, id);
CREATE INDEX IF NOT EXISTS idx_customer_check_slot ON customer_check_slots(record_id, burn_hours);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_check_order_code_unique
  ON customer_check_records(purchase_order_id, lower(customer_code));
CREATE INDEX IF NOT EXISTS idx_log_test ON burn_test_logs(burn_test_id);
CREATE INDEX IF NOT EXISTS idx_product_order ON products(order_id);



CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qc_standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  criterion TEXT NOT NULL,
  min_value TEXT,
  max_value TEXT,
  unit TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS sample_burn_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL,
  product_name TEXT,
  size TEXT,
  weight REAL,
  wick_spec TEXT,
  test_date TEXT,
  tester TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sample_burn_test_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_test_id INTEGER NOT NULL REFERENCES sample_burn_tests(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sample_test_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_sample_test_date ON sample_burn_tests(test_date);
CREATE INDEX IF NOT EXISTS idx_sample_test_po ON sample_burn_tests(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_sample_test_photo ON sample_burn_test_photos(sample_test_id);

CREATE TABLE IF NOT EXISTS sample_burn_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_test_id INTEGER NOT NULL REFERENCES sample_burn_tests(id) ON DELETE CASCADE,
  cycle_no INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('BURN','REST')),
  start_at TEXT NOT NULL,
  end_at TEXT,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sample_cycle_test ON sample_burn_cycles(sample_test_id, cycle_no, phase);

CREATE TABLE IF NOT EXISTS qc_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);


`);

const defaultUnits = [['mm', 'Millimet', 1], ['°C', 'Độ C', 1], ['s', 'Giây', 1], ['g/h', 'Gram/giờ', 1]];
for (const unit of defaultUnits) {
  db.prepare('INSERT OR IGNORE INTO qc_units(code,name,active) VALUES(?,?,?)').run(...unit);
}

try { db.exec("ALTER TABLE burn_tests ADD COLUMN material_types TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE products ADD COLUMN image_url TEXT"); } catch (_) {}
{
  const columns = new Set(db.prepare('PRAGMA table_info(products)').all().map(column => column.name));
  if (!columns.has('customer_po_code')) db.exec('ALTER TABLE products ADD COLUMN customer_po_code TEXT');
  if (!columns.has('customer_code')) db.exec('ALTER TABLE products ADD COLUMN customer_code TEXT');
}
{
  const columns = new Set(db.prepare('PRAGMA table_info(customer_check_records)').all().map(column => column.name));
  if (!columns.has('is_completed')) db.exec('ALTER TABLE customer_check_records ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0');
}

// Cache các câu prepared statement theo SQL text để không phải compile lại mỗi lần gọi.
const stmtCache = new Map();
function prepare(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

// node:sqlite (DatabaseSync) chưa có sẵn helper `transaction` như better-sqlite3,
// tự bọc thủ công bằng BEGIN/COMMIT/ROLLBACK.
function closeDatabase() {
  try { stmtCache.clear(); } catch (_) {}
  try { db.close(); } catch (_) {}
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_e) { /* ignore */ }
    throw err;
  }
}

const { hashPassword } = require('../lib/auth');
const cnt = prepare('SELECT COUNT(*) AS n FROM users').get();
if(!cnt || Number(cnt.n) === 0){
  prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', hashPassword('admin123'), 'admin');
  console.log('🔐 Đã tạo tài khoản admin mặc định:  admin / admin123   (hãy đổi sau khi đăng nhập)');
}


function ensureSampleBurnColumns(){
  const cols = [
    ['start_at','TEXT'],
    ['end_at','TEXT'],
    ['burn_total_seconds','INTEGER'],
    ['overall_result','TEXT NOT NULL DEFAULT "PENDING"'],
    ['is_running','INTEGER NOT NULL DEFAULT 0'],
    ['current_phase','TEXT NOT NULL DEFAULT "BURN"'],
    ['phase_started_at','TEXT'],
    ['phase_elapsed_seconds','INTEGER NOT NULL DEFAULT 0'],
    ['last_saved_at','TEXT']
  ];
  const existing = new Set(db.prepare("PRAGMA table_info(sample_burn_tests)").all().map(x=>x.name));
  for(const [name,type] of cols){ if(!existing.has(name)) db.exec(`ALTER TABLE sample_burn_tests ADD COLUMN ${name} ${type}`); }
}
ensureSampleBurnColumns();

function ensureQcStandardColumns(){
  const cols = [
    ['customer_id','INTEGER REFERENCES customers(id)']
  ];
  const existing = new Set(db.prepare("PRAGMA table_info(qc_standards)").all().map(x=>x.name));
  for(const [name,type] of cols){ if(!existing.has(name)) db.exec(`ALTER TABLE qc_standards ADD COLUMN ${name} ${type}`); }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_qc_standards_customer ON qc_standards(customer_id)'); } catch(_){}
}
ensureQcStandardColumns();

module.exports = { db, prepare, transaction, closeDatabase, DB_PATH, UPLOADS_DIR };
