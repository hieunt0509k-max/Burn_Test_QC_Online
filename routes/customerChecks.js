const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { prepare, transaction, UPLOADS_DIR } = require('../database/database');
const { buildCustomerCheckReportXlsx } = require('../lib/customerCheckReportXlsx');

const router = express.Router();
const customerCheckDir = path.join(UPLOADS_DIR, 'customer-checks');
fs.mkdirSync(customerCheckDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận JPG, PNG, WEBP hoặc GIF'));
    }
    cb(null, true);
  }
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function safePart(value, fallback) {
  const cleaned = clean(value).normalize('NFKC')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback).slice(0, 100);
}

function recordWithPhotos(id) {
  const record = prepare(`SELECT r.id, r.purchase_order_id, r.customer_code,
    po.po_number, r.created_at, r.updated_at
    FROM customer_check_records r
    JOIN purchase_orders po ON po.id = r.purchase_order_id
    WHERE r.id = ?`).get(id);
  if (!record) return null;
  record.slots = prepare('SELECT id, burn_hours FROM customer_check_slots WHERE record_id = ? ORDER BY burn_hours, id').all(id);
  record.photos = prepare(`SELECT id, record_id, burn_hours, file_name, file_url,
    original_name, mime_type, file_size, created_at
    FROM customer_check_photos WHERE record_id = ? ORDER BY burn_hours, id`).all(id);
  return record;
}

function getOrCreateRecord(orderId, customerCode) {
  const order = prepare('SELECT id, po_number FROM purchase_orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Không tìm thấy đơn hàng');
  const code = clean(customerCode);
  if (!code) throw new Error('Mã khách hàng là bắt buộc');
  prepare(`INSERT INTO customer_check_records (purchase_order_id, customer_code)
    VALUES (?, ?) ON CONFLICT(purchase_order_id, customer_code) DO UPDATE SET updated_at=datetime('now')`)
    .run(orderId, code);
  const record = prepare('SELECT id FROM customer_check_records WHERE purchase_order_id = ? AND customer_code = ?')
    .get(orderId, code);
  for (const hours of [0]) {
    prepare('INSERT OR IGNORE INTO customer_check_slots (record_id, burn_hours) VALUES (?, ?)').run(record.id, hours);
  }
  return record;
}

function photoPath(record, hours, photoId, originalName) {
  const ext = (path.extname(originalName || '').toLowerCase() || '.jpg').replace(/[^a-z0-9.]/g, '') || '.jpg';
  const folder = path.join(customerCheckDir, safePart(record.po_number, 'PO'), safePart(record.customer_code, 'NO_CODE'));
  fs.mkdirSync(folder, { recursive: true });
  const relative = path.relative(UPLOADS_DIR, path.join(folder, `${safePart(hours, '0')}H-${photoId}${ext}`)).split(path.sep).join('/');
  return { relative, disk: path.join(UPLOADS_DIR, relative) };
}

function deleteFile(relative) {
  if (!relative) return;
  try { fs.unlinkSync(path.join(UPLOADS_DIR, ...relative.split('/'))); }
  catch (err) { if (err.code !== 'ENOENT') console.warn('Không xóa được ảnh khách kiểm:', err.message); }
}

router.get('/', (req, res, next) => {
  try {
    const orderId = Number(req.query.purchase_order_id);
    const code = clean(req.query.customer_code);
    if (!orderId || !code) return res.status(400).json({ error: 'purchase_order_id và customer_code là bắt buộc' });
    const record = getOrCreateRecord(orderId, code);
    res.json(recordWithPhotos(record.id));
  } catch (err) { next(err); }
});

router.get('/codes', (req, res, next) => {
  try {
    const orderId = Number(req.query.purchase_order_id);
    if (!orderId) return res.status(400).json({ error: 'purchase_order_id là bắt buộc' });
    const order = prepare('SELECT id FROM purchase_orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(prepare(`SELECT id, customer_code, created_at, updated_at
      FROM customer_check_records WHERE purchase_order_id = ? ORDER BY customer_code`).all(orderId));
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const orderId = Number(req.body.purchase_order_id);
    const customerCode = clean(req.body.customer_code);
    const existing = prepare(`SELECT id FROM customer_check_records
      WHERE purchase_order_id = ? AND lower(customer_code) = lower(?)`).get(orderId, customerCode);
    if (existing) return res.status(409).json({ error: 'Mã hàng này đã tồn tại trong đơn hàng' });
    const record = getOrCreateRecord(orderId, customerCode);
    res.status(201).json(recordWithPhotos(record.id));
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Mã hàng này đã tồn tại trong đơn hàng' });
    next(err);
  }
});

router.get('/:id/report.xlsx', async (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy mã khách hàng' });
    const safeCode = String(record.customer_code || req.params.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
    const buffer = await buildCustomerCheckReportXlsx(Number(req.params.id));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`anh-khach-kiem-${safeCode}.xlsx`)}`);
    res.send(buffer);
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy mã khách hàng' });
    const customerCode = clean(req.body.customer_code);
    if (!customerCode) return res.status(400).json({ error: 'Mã hàng của khách hàng là bắt buộc' });
    const duplicate = prepare(`SELECT id FROM customer_check_records
      WHERE purchase_order_id = ? AND lower(customer_code) = lower(?) AND id <> ?`)
      .get(record.purchase_order_id, customerCode, record.id);
    if (duplicate) return res.status(409).json({ error: 'Mã này đã tồn tại trong đơn hàng' });

    const oldFolder = path.join(customerCheckDir, safePart(record.po_number, 'PO'), safePart(record.customer_code, 'NO_CODE'));
    prepare("UPDATE customer_check_records SET customer_code = ?, updated_at = datetime('now') WHERE id = ?")
      .run(customerCode, record.id);
    const updated = recordWithPhotos(record.id);
    for (const photo of updated.photos) {
      const oldPath = path.join(UPLOADS_DIR, ...photo.file_name.split('/'));
      const next = photoPath(updated, photo.burn_hours, photo.id, photo.original_name);
      if (fs.existsSync(oldPath) && oldPath !== next.disk) {
        fs.mkdirSync(path.dirname(next.disk), { recursive: true });
        fs.renameSync(oldPath, next.disk);
      }
      prepare('UPDATE customer_check_photos SET file_name = ?, file_url = ? WHERE id = ?')
        .run(next.relative, `/uploads/${next.relative}`, photo.id);
    }
    try { if (fs.existsSync(oldFolder) && !fs.readdirSync(oldFolder).length) fs.rmdirSync(oldFolder); } catch (_) {}
    res.json(recordWithPhotos(record.id));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy mã khách hàng' });
    prepare('DELETE FROM customer_check_records WHERE id = ?').run(record.id);
    for (const photo of record.photos) deleteFile(photo.file_name);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/photos', upload.single('file'), async (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy hồ sơ ảnh khách kiểm' });
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });
    const hours = Number(req.body.burn_hours);
    if (!Number.isFinite(hours) || hours < 0) return res.status(400).json({ error: 'Mốc giờ không hợp lệ' });
    const count = prepare('SELECT COUNT(*) AS n FROM customer_check_photos WHERE record_id = ? AND burn_hours = ?').get(record.id, hours);
    if (Number(count.n) >= 3) return res.status(409).json({ error: 'Mỗi mốc giờ chỉ cho phép tối đa 3 ảnh' });
    const compressedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const result = transaction(() => {
      const inserted = prepare(`INSERT INTO customer_check_photos
        (record_id, burn_hours, file_name, file_url, original_name, mime_type, file_size)
        VALUES (?, ?, '', '', ?, ?, ?)`)
        .run(record.id, hours, req.file.originalname, 'image/jpeg', compressedBuffer.length);
      const photoId = Number(inserted.lastInsertRowid);
      const file = photoPath(record, hours, photoId, '.jpg');
      // Giữ ảnh đủ rõ để xem/đưa vào Excel nhưng tránh lưu file camera quá lớn.
      fs.writeFileSync(file.disk, compressedBuffer);
      prepare('UPDATE customer_check_photos SET file_name = ?, file_url = ? WHERE id = ?')
        .run(file.relative, `/uploads/${file.relative}`, photoId);
      prepare("UPDATE customer_check_records SET updated_at = datetime('now') WHERE id = ?").run(record.id);
      return photoId;
    });

    res.status(201).json(recordWithPhotos(record.id));
  } catch (err) { next(err); }
});

router.post('/:id/slots', (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy hồ sơ ảnh khách kiểm' });
    const hours = Number(req.body.burn_hours);
    if (!Number.isFinite(hours) || hours < 0) return res.status(400).json({ error: 'Mốc giờ không hợp lệ' });
    prepare('INSERT OR IGNORE INTO customer_check_slots (record_id, burn_hours) VALUES (?, ?)').run(record.id, hours);
    prepare("UPDATE customer_check_records SET updated_at = datetime('now') WHERE id = ?").run(record.id);
    res.status(201).json(recordWithPhotos(record.id));
  } catch (err) { next(err); }
});

router.delete('/:id/slots/:slotId', (req, res, next) => {
  try {
    const record = recordWithPhotos(req.params.id);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy hồ sơ ảnh khách kiểm' });
    const slot = record.slots.find(item => String(item.id) === String(req.params.slotId));
    if (!slot) return res.status(404).json({ error: 'Không tìm thấy mốc giờ' });
    if (Number(slot.burn_hours) === 0) return res.status(400).json({ error: 'Không thể xóa mốc Start' });
    const photoCount = prepare('SELECT COUNT(*) AS n FROM customer_check_photos WHERE record_id = ? AND burn_hours = ?')
      .get(record.id, slot.burn_hours);
    if (Number(photoCount.n) > 0) return res.status(409).json({ error: 'Chỉ có thể xóa mốc giờ chưa có ảnh' });
    prepare('DELETE FROM customer_check_slots WHERE id = ? AND record_id = ?').run(slot.id, record.id);
    prepare("UPDATE customer_check_records SET updated_at = datetime('now') WHERE id = ?").run(record.id);
    res.json(recordWithPhotos(record.id));
  } catch (err) { next(err); }
});

router.delete('/:id/photos/:photoId', (req, res, next) => {
  try {
    const photo = prepare('SELECT file_name FROM customer_check_photos WHERE id = ? AND record_id = ?')
      .get(req.params.photoId, req.params.id);
    if (!photo) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    prepare('DELETE FROM customer_check_photos WHERE id = ? AND record_id = ?').run(req.params.photoId, req.params.id);
    deleteFile(photo.file_name);
    prepare("UPDATE customer_check_records SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
