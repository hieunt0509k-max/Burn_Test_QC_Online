// migrate_users.js — chạy 1 lần để tạo bảng users + tài khoản admin
// Cách dùng:  node migrate_users.js

const path = require('path');
// Đường dẫn tới database.js — sửa nếu project của bạn khác cấu trúc
const database = require('./database/database');
const { hashPassword } = require('./lib/auth');

// database.js của bạn có thể export `prepare`, `transaction`, hoặc `db`.
// Script này tự dò để dùng đúng API.
const db = database.prepare
  ? { prepare: database.prepare, raw: null }
  : database;

function p(sql){ return database.prepare(sql); }

console.log('🔧 Bắt đầu migrate...');

// ---------- 1. Tạo bảng users nếu chưa có ----------
p(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`).run();
console.log('✓ Bảng users đã sẵn sàng');

// ---------- 2. Seed admin nếu chưa có ----------
const existing = p('SELECT id, username FROM users WHERE username = ?').get('admin');
if(existing){
  console.log('✓ Tài khoản admin đã tồn tại (id=' + existing.id + ')');
  console.log('  → Bỏ qua bước tạo. Nếu muốn reset mật khẩu, chạy: node reset_admin.js');
} else {
  const hash = hashPassword('admin123');
  p('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', hash, 'admin');
  console.log('✓ Đã tạo tài khoản admin');
  console.log('    Tài khoản: admin');
  console.log('    Mật khẩu : admin123');
}

// ---------- 3. Liệt kê user hiện có ----------
const all = p('SELECT id, username, role, created_at FROM users').all();
console.log('\n📋 Danh sách tài khoản hiện có:');
all.forEach(u => console.log(`   [${u.id}] ${u.username}  (${u.role})  — tạo lúc ${u.created_at}`));

console.log('\n✅ Migrate xong. Hãy RESTART server (Ctrl+C → node server.js).');
process.exit(0);