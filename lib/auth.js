// lib/auth.js — hash mật khẩu + ký/verify JWT
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'burn-test-qc-secret-change-me-in-production';
const TOKEN_TTL = '30d';

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