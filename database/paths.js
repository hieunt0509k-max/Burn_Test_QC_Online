// Chỉ định nghĩa đường dẫn — KHÔNG mở kết nối SQLite ở đây.
// Tách riêng để lib/restore có thể kiểm tra/áp dụng bản khôi phục TRƯỚC KHI
// database.js mở file .db (trên Windows không ghi đè được file đang mở).
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'burn_test.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

module.exports = { DB_PATH, UPLOADS_DIR, BACKUP_DIR };
