// middleware/auth.js
const { verifyToken } = require('../lib/auth');

function readToken(req){
  const h = req.headers.authorization || '';
  if(h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

// Luôn chạy: đọc token nếu có, gán req.user (có thể null)
function optionalAuth(req, _res, next){
  const t = readToken(req);
  req.user = t ? verifyToken(t) : null;
  next();
}

// Bắt buộc đăng nhập
function requireAuth(req, res, next){
  if(!req.user) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
  next();
}

module.exports = { optionalAuth, requireAuth };