// lib/auth.js — hash mật khẩu + ký/verify JWT
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = process.env.JWT_TTL || '30d';

// Khóa ký JWT: ưu tiên biến môi trường JWT_SECRET; nếu không có thì tự sinh khóa ngẫu nhiên
// và lưu cạnh file database (data/.jwt-secret) để token vẫn hợp lệ sau khi khởi động lại.
// (Trước đây dùng khóa mặc định cố định trong mã nguồn -> ai cũng có thể giả mạo token.)
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const dataDir = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.join(__dirname, '..', 'data');
  const file = path.join(dataDir, '.jwt-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (_) { /* chưa có file -> tạo mới bên dưới */ }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
  } catch (err) {
    console.warn('⚠ Không lưu được JWT secret (' + err.message + '); token sẽ mất hiệu lực khi khởi động lại server.');
  }
  return secret;
}
const SECRET = loadSecret();

function hashPassword(pw){ return bcrypt.hashSync(String(pw), 10); }
function verifyPassword(pw, hash){ return bcrypt.compareSync(String(pw), String(hash)); }

function signToken(user){
  return jwt.sign(
    { id: user.id, u: user.username, r: user.role || 'admin' },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}
function verifyToken(token){
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
