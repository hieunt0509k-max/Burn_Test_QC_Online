// Áp dụng bản khôi phục đã "đăng ký" (staged) từ lần chạy trước — PHẢI được require
// TRƯỚC database.js, vì việc ghi đè file .db chỉ an toàn khi chưa có kết nối SQLite
// nào mở tới nó (đặc biệt trên Windows, file đang mở sẽ không ghi đè được).
const fs = require('fs');
const path = require('path');
const { DB_PATH, UPLOADS_DIR, BACKUP_DIR } = require('../database/paths');

const PENDING_MARKER = path.join(path.dirname(DB_PATH), '.restore-pending.json');

function applyPendingRestoreIfAny() {
  if (!fs.existsSync(PENDING_MARKER)) return null;

  let info;
  try { info = JSON.parse(fs.readFileSync(PENDING_MARKER, 'utf8')); }
  catch (_e) { fs.unlinkSync(PENDING_MARKER); return null; }

  const folder = path.join(BACKUP_DIR, info.backupName);
  const dbFile = path.join(folder, path.basename(DB_PATH));
  if (!fs.existsSync(dbFile)) {
    console.warn(`⚠ Bản backup "${info.backupName}" không còn tồn tại, hủy yêu cầu khôi phục.`);
    fs.unlinkSync(PENDING_MARKER);
    return null;
  }

  // Xóa file WAL/SHM cũ (nếu có) để không bị lẫn với dữ liệu của DB vừa khôi phục.
  for (const ext of ['-wal', '-shm']) {
    try { fs.unlinkSync(DB_PATH + ext); } catch (_e) { /* không có thì thôi */ }
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.copyFileSync(dbFile, DB_PATH);

  const uploadsBackup = path.join(folder, 'uploads');
  if (fs.existsSync(uploadsBackup)) {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
    fs.cpSync(uploadsBackup, UPLOADS_DIR, { recursive: true });
  }

  fs.unlinkSync(PENDING_MARKER);
  console.log(`✔ Đã khôi phục dữ liệu từ bản backup: ${info.backupName}`);
  return info.backupName;
}

module.exports = { applyPendingRestoreIfAny };
