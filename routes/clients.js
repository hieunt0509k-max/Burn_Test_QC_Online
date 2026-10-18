const express = require('express');
const { prepare } = require('../database/database');
const router = express.Router();

function legacy(row) {
  if (!row) return row;
  return { ...row, Cus_id: row.id, Cus_Name: row.name };
}

router.get('/', (_req, res, next) => {
  try {
    const rows = prepare('SELECT id, name, created_at FROM customers ORDER BY name').all();
    res.json(rows.map(legacy));
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = prepare('SELECT id, name, created_at FROM customers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    res.json(legacy(row));
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  const name = String(req.body.name ?? req.body.cus_name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Tên khách hàng là bắt buộc' });
  try {
    const existing = prepare('SELECT id FROM customers WHERE name = ?').get(name);
    if (existing) return res.status(409).json({ error: 'Khách hàng đã tồn tại' });

    const r = prepare('INSERT INTO customers (name) VALUES (?)').run(name);
    const row = prepare('SELECT id, name, created_at FROM customers WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(legacy(row));
  } catch (err) { next(err); }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    const name = String(req.body.name ?? req.body.cus_name ?? existing.name).trim();
    if (!name) return res.status(400).json({ error: 'Tên khách hàng không được để trống' });

    const dup = prepare('SELECT id FROM customers WHERE name = ? AND id != ?').get(name, req.params.id);
    if (dup) return res.status(409).json({ error: 'Khách hàng đã tồn tại' });

    prepare('UPDATE customers SET name = ? WHERE id = ?').run(name, req.params.id);
    const row = prepare('SELECT id, name, created_at FROM customers WHERE id = ?').get(req.params.id);
    res.json(legacy(row));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (String(err.message || '').includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Không thể xóa khách hàng đang có PO/test' });
    }
    next(err);
  }
});

module.exports = router;
