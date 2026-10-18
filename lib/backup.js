// Backup/Restore SQLite + uploads.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { db, DB_PATH, UPLOADS_DIR, closeDatabase } = require('../database/database');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const BACKUP_KEEP = 5;

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const folder = path.join(BACKUP_DIR, e.name);
      const dbFile = path.join(folder, path.basename(DB_PATH));
      const uploads = path.join(folder, 'uploads');
      let dbSize = 0, uploadSize = 0;
      try { if (fs.existsSync(dbFile)) dbSize = fs.statSync(dbFile).size; } catch (_) {}
      try { uploadSize = dirSize(uploads); } catch (_) {}
      return { name: e.name, folder, dbFile, hasDb: fs.existsSync(dbFile), hasUploads: fs.existsSync(uploads), dbSize, uploadSize };
    })
    .sort((a,b) => b.name.localeCompare(a.name));
}

function validateBackup(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(name || ''))) throw new Error('Tên bản backup không hợp lệ.');
  const folder = path.resolve(BACKUP_DIR, name);
  const root = path.resolve(BACKUP_DIR);
  if (path.dirname(folder) !== root) throw new Error('Đường dẫn backup không hợp lệ.');
  const dbFile = path.join(folder, path.basename(DB_PATH));
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('Không tìm thấy bản backup.');
  if (!fs.existsSync(dbFile)) throw new Error('Bản backup không có file database.');
  return { name, folder, dbFile, uploads: path.join(folder, 'uploads') };
}

function verifyBackup(name) {
  const b = validateBackup(name);
  let testDb;
  try {
    testDb = new DatabaseSync(b.dbFile, { readOnly: true });
    const integrity = testDb.prepare('PRAGMA integrity_check').get();
    const quick = testDb.prepare('PRAGMA quick_check').get();
    const ok = integrity?.integrity_check === 'ok' && quick?.quick_check === 'ok';
    return { ok, name: b.name, hasUploads: fs.existsSync(b.uploads), dbSize: fs.statSync(b.dbFile).size, integrity, quick };
  } finally {
    try { testDb?.close(); } catch (_) {}
  }
}

function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  let folder = path.join(BACKUP_DIR, timestamp());
  // Tránh trùng tên khi bấm Backup nhiều lần trong cùng một giây.
  if (fs.existsSync(folder)) folder = path.join(BACKUP_DIR, `${timestamp()}_${Date.now() % 1000}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(DB_PATH, path.join(folder, path.basename(DB_PATH)));
  if (fs.existsSync(UPLOADS_DIR)) fs.cpSync(UPLOADS_DIR, path.join(folder, 'uploads'), { recursive: true });
  // Dọn backup cũ nhưng không để lỗi EPERM của một thư mục đang bị Windows
  // khóa (Explorer/antivirus/tiến trình khác) làm thất bại bản backup vừa tạo.
  try { pruneOldBackups(); } catch (_) {}
  return folder;
}

function restoreBackup(name) {
  const b = validateBackup(name);
  const check = verifyBackup(name);
  if (!check.ok) throw new Error('Bản backup không đạt integrity_check / quick_check, không thể restore.');

  // Tạo một safety backup của dữ liệu hiện tại trước khi thay thế.
  const safetyFolder = backupNow();

  // Đóng SQLite trước khi thay file để không còn handle/WAL đang mở.
  closeDatabase();

  const dbWal = DB_PATH + '-wal';
  const dbShm = DB_PATH + '-shm';
  if (fs.existsSync(dbWal)) fs.rmSync(dbWal, { force: true });
  if (fs.existsSync(dbShm)) fs.rmSync(dbShm, { force: true });
  fs.copyFileSync(b.dbFile, DB_PATH);

  if (fs.existsSync(b.uploads)) {
    const oldUploads = `${UPLOADS_DIR}.__restore_old_${Date.now()}`;
    if (fs.existsSync(UPLOADS_DIR)) fs.renameSync(UPLOADS_DIR, oldUploads);
    try {
      fs.cpSync(b.uploads, UPLOADS_DIR, { recursive: true });
      fs.rmSync(oldUploads, { recursive: true, force: true });
    } catch (err) {
      try { fs.rmSync(UPLOADS_DIR, { recursive: true, force: true }); } catch (_) {}
      if (fs.existsSync(oldUploads)) fs.renameSync(oldUploads, UPLOADS_DIR);
      throw err;
    }
  }

  return { ok: true, restored: b.name, safetyBackup: safetyFolder, uploadsRestored: fs.existsSync(b.uploads) };
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort().reverse();
  for (const name of entries.slice(BACKUP_KEEP)) {
    try {
      fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
    } catch (err) {
      // Windows có thể trả EPERM nếu backup cũ đang bị khóa. Bỏ qua mục đó;
      // không được làm hỏng thao tác backup hiện tại.
      if (err && err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err;
    }
  }
}

function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    try { total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } catch (_) {}
  }
  return total;
}

module.exports = { backupNow, pruneOldBackups, listBackups, verifyBackup, restoreBackup, BACKUP_DIR, BACKUP_KEEP };
