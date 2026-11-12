// routes/auth.js
const express = require('express');
const { prepare } = require('../database/database');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------- Chống dò mật khẩu (brute-force) ----------
// Đếm số lần đăng nhập sai theo (IP + tài khoản). Sai quá MAX_FAILS lần trong WINDOW_MS
// thì khóa tạm LOCK_MS. Lưu trong bộ nhớ: khởi động lại server sẽ reset, đủ dùng cho app nội bộ.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginAttempts = new Map();

function loginKey(req, username){
  return `${req.ip || req.socket?.remoteAddress || '?'}|${String(username).toLowerCase()}`;
}
function sweepLoginAttempts(now){
  for(const [key, a] of loginAttempts){
    if((a.lockedUntil || 0) < now && now - a.first > LOGIN_WINDOW_MS) loginAttempts.delete(key);
  }
}
function loginLockedSeconds(key, now){
  const a = loginAttempts.get(key);
  return a && a.lockedUntil > now ? Math.ceil((a.lockedUntil - now) / 1000) : 0;
}
function noteLoginFailure(key, now){
  let a = loginAttempts.get(key);
  if(!a || now - a.first > LOGIN_WINDOW_MS) a = { count: 0, first: now, lockedUntil: 0 };
  a.count += 1;
  if(a.count >= LOGIN_MAX_FAILS){ a.lockedUntil = now + LOGIN_LOCK_MS; a.count = 0; a.first = now; }
  loginAttempts.set(key, a);
}

// ---------- Đăng nhập ----------
router.post('/login', (req, res) => {
  try{
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if(!username || !password)
      return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu' });

    const now = Date.now();
    sweepLoginAttempts(now);
    const key = loginKey(req, username);
    const locked = loginLockedSeconds(key, now);
    if(locked){
      res.set('Retry-After', String(locked));
      return res.status(429).json({ error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(locked / 60)} phút.` });
    }

    const user = prepare('SELECT * FROM users WHERE username = ?').get(username);
    if(!user || !verifyPassword(password, user.password_hash)){
      noteLoginFailure(key, now);
      return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không đúng' });
    }
    loginAttempts.delete(key);

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// ---------- Kiểm tra token còn sống ----------
router.get('/me', requireAuth, (req, res) => {
  const user = prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.user.id);
  if(!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
  res.json({ user });
});

// ---------- Đổi mật khẩu ----------
router.post('/change-password', requireAuth, (req, res) => {
  try{
    const oldPw = String(req.body?.old_password || '');
    const newPw = String(req.body?.new_password || '');
    if(newPw.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });

    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if(!user) return res.status(401).json({ error: 'Không tìm thấy tài khoản' });
    if(!verifyPassword(oldPw, user.password_hash))
      return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });

    prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPw), user.id);
    res.json({ ok: true });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

router.post('/logout', (_req, res) => res.json({ ok: true }));

// ---------- Quản lý người dùng (chỉ admin) ----------
function requireAdmin(req, res, next){
  if(!req.user) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
  if(String(req.user.r || '').toLowerCase() !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền này' });
  next();
}

router.get('/users', requireAdmin, (_req, res) => {
  const users = prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
  res.json(users);
});

router.post('/users', requireAdmin, (req, res) => {
  try{
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'user').trim().toLowerCase();
    if(!username) return res.status(400).json({ error: 'Thiếu tên tài khoản' });
    if(username.length < 3) return res.status(400).json({ error: 'Tài khoản tối thiểu 3 ký tự' });
    if(password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    if(!['admin','user'].includes(role)) return res.status(400).json({ error: 'Vai trò chỉ nhận admin hoặc user' });

    const dup = prepare('SELECT id FROM users WHERE username = ?').get(username);
    if(dup) return res.status(409).json({ error: 'Tài khoản này đã tồn tại' });

    const r = prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, hashPassword(password), role);
    res.status(201).json({ id: r.lastInsertRowid, username, role });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', requireAdmin, (req, res) => {
  try{
    const id = Number(req.params.id);
    const user = prepare('SELECT * FROM users WHERE id = ?').get(id);
    if(!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    const role = req.body?.role !== undefined ? String(req.body.role).trim().toLowerCase() : user.role;
    if(!['admin','user'].includes(role)) return res.status(400).json({ error: 'Vai trò chỉ nhận admin hoặc user' });

    // Không cho hạ cấp admin cuối cùng
    if(user.role === 'admin' && role !== 'admin'){
      const adminCount = prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get();
      if(Number(adminCount.n) <= 1) return res.status(400).json({ error: 'Không thể hạ cấp quản trị viên cuối cùng' });
    }

    const password = req.body?.password !== undefined ? String(req.body.password) : '';
    if(password){
      if(password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
      prepare('UPDATE users SET role = ?, password_hash = ? WHERE id = ?').run(role, hashPassword(password), id);
    } else {
      prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    }
    res.json({ id, username: user.username, role });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  try{
    const id = Number(req.params.id);
    const user = prepare('SELECT * FROM users WHERE id = ?').get(id);
    if(!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if(id === Number(req.user.id)) return res.status(400).json({ error: 'Không thể xóa tài khoản đang đăng nhập' });
    if(user.role === 'admin'){
      const adminCount = prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get();
      if(Number(adminCount.n) <= 1) return res.status(400).json({ error: 'Không thể xóa quản trị viên cuối cùng' });
    }
    prepare('DELETE FROM users WHERE id = ?').run(id);
    res.status(204).send();
  } catch(err){ res.status(500).json({ error: err.message }); }
});

module.exports = router;