// lib/imageExt.js — chọn đuôi file ảnh an toàn khi lưu upload.
// Không tin đuôi tên file do client gửi (vd "x.html" gửi kèm Content-Type image/png sẽ bị
// /uploads phục vụ như trang HTML -> XSS). Chỉ cho phép đuôi ảnh trong danh sách trắng.
const path = require('path');

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function safeImageExt(mimetype, originalName) {
  const byName = path.extname(String(originalName || '')).toLowerCase();
  if (ALLOWED.has(byName)) return byName;
  const byMime = MIME_TO_EXT[String(mimetype || '').split(';', 1)[0].trim().toLowerCase()];
  return byMime || '.jpg';
}

module.exports = { safeImageExt };
