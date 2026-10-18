const express = require('express');
const { prepare } = require('../database/database');
const router = express.Router();

function getPO(id) {
  const row = prepare(`
    SELECT po.id, po.customer_id, po.po_number, po.created_at, c.name AS customer_name,
      (SELECT COUNT(*) FROM products p WHERE p.order_id = po.id) AS product_count,
      (SELECT COUNT(DISTINCT bt.product_code) FROM burn_tests bt WHERE bt.purchase_order_id = po.id) AS tested_count
    FROM purchase_orders po
    JOIN customers c ON c.id = po.customer_id
    WHERE po.id = ?
  `).get(id);
  if (!row) return null;
  const testedCount = Number(row.tested_count || 0);
  const productCount = Number(row.product_count || 0);
  const untestedCount = Math.max(0, productCount - testedCount);
  return {
    ...row,
    PO_Id: row.id,
    Cus_id: row.customer_id,
    PO_Name: row.po_number,
    Cus_Name: row.customer_name,
    test_count: testedCount,
    untested_count: untestedCount,
    product_count: productCount
  };
}

function listPOs(filters = {}) {
  const customerId = filters.customer_id || filters.cus_id;
  let sql = `
    SELECT po.id, po.customer_id, po.po_number, po.created_at, c.name AS customer_name,
      (SELECT COUNT(*) FROM products p WHERE p.order_id = po.id) AS product_count,
      (SELECT COUNT(DISTINCT bt.product_code) FROM burn_tests bt WHERE bt.purchase_order_id = po.id) AS tested_count
    FROM purchase_orders po
    JOIN customers c ON c.id = po.customer_id
  `;
  const params = [];
  if (customerId) { sql += ' WHERE po.customer_id = ?'; params.push(customerId); }
  sql += ' ORDER BY po.po_number';

  const rows = prepare(sql).all(...params);
  if (!rows.length) return [];

  return rows.map(x => {
    const testedCount = Number(x.tested_count || 0);
    const productCount = Number(x.product_count || 0);
    const untestedCount = Math.max(0, productCount - testedCount);
    return {
      ...x,
      PO_Id: x.id,
      Cus_id: x.customer_id,
      PO_Name: x.po_number,
      Cus_Name: x.customer_name,
      test_count: testedCount,
      untested_count: untestedCount,
      product_count: productCount
    };
  });
}

router.get('/', (req, res, next) => {
  try { res.json(listPOs(req.query)); } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = getPO(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy PO' });
    res.json(row);
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  const customerId = Number(req.body.customer_id ?? req.body.cus_id);
  const poNumber = String(req.body.po_number ?? req.body.po_name ?? '').trim();
  if (!customerId || !poNumber) return res.status(400).json({ error: 'customer_id và po_number là bắt buộc' });
  try {
    const customer = prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });

    const dup = prepare('SELECT id FROM purchase_orders WHERE customer_id = ? AND po_number = ?').get(customerId, poNumber);
    if (dup) return res.status(409).json({ error: 'PO này đã tồn tại với khách hàng đã chọn' });

    const r = prepare('INSERT INTO purchase_orders (customer_id, po_number) VALUES (?, ?)').run(customerId, poNumber);
    res.status(201).json(getPO(r.lastInsertRowid));
  } catch (err) { next(err); }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy PO' });

    const customerId = Number(req.body.customer_id ?? req.body.cus_id ?? existing.customer_id);
    const poNumber = String(req.body.po_number ?? req.body.po_name ?? existing.po_number).trim();

    const customer = prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });

    const dup = prepare('SELECT id FROM purchase_orders WHERE customer_id = ? AND po_number = ? AND id != ?').get(customerId, poNumber, req.params.id);
    if (dup) return res.status(409).json({ error: 'PO này đã tồn tại với khách hàng đã chọn' });

    prepare('UPDATE purchase_orders SET customer_id = ?, po_number = ? WHERE id = ?').run(customerId, poNumber, req.params.id);
    res.json(getPO(req.params.id));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (String(err.message || '').includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Không thể xóa PO đang có dữ liệu test' });
    }
    next(err);
  }
});

module.exports = router;
