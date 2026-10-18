const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { prepare, transaction } = require('../database/database');
const { generateProductLabelsPdf } = require('../lib/labelReport');
const { generateProductOrderReportXlsx } = require('../lib/productReport');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = /\.(xlsx|xls)$/i.test(file.originalname);
    if (!okExt) return cb(new Error('Chỉ chấp nhận file .xlsx hoặc .xls'));
    cb(null, true);
  }
});

// Cột Excel cố định cần đọc (theo chữ cái cột) -> tên field trong bảng products.
// order_id KHÔNG lấy từ Excel — luôn gán theo PO người dùng chọn lúc import.
// diameter_mm/height_mm KHÔNG đọc trực tiếp từ cột nào — tự tách từ chuỗi "size"
// (xem hàm parseSizeToDimensions bên dưới).
const COLUMN_MAP = [
  ['G', 'product_code'],
  ['M', 'size'],
  ['S', 'weight'],
  ['X', 'wick'],
  ['Y', 'color'],
  ['AB', 'fragrance']
];
const NUMERIC_FIELDS = new Set(['weight']);

function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
const COLUMN_INDEXES = COLUMN_MAP.map(([letter, field]) => [colLetterToIndex(letter), field]);

// Tách đường kính + chiều cao từ chuỗi size, hỗ trợ 2 định dạng:
//   - "1000x90xH10mm"  -> đường kính = số đầu tiên (1000), chiều cao = số sau chữ H (10), đơn vị mm (không đổi).
//   - "D8x10cm"        -> đường kính = số sau chữ D/Ø (8), chiều cao = số sau dấu x khi không có H (10),
//                          đơn vị cm -> tự nhân 10 để đổi ra mm: diameter_mm=80, height_mm=100.
// Số ở giữa không thuộc 2 vị trí trên (nếu có) không map vào field nào cả.
function parseSizeToDimensions(size) {
  if (!size) return { diameter_mm: null, height_mm: null };
  const str = String(size).trim();

  // Đơn vị: có hậu tố "cm" (và không phải "mm") ở cuối chuỗi -> nhân 10 để ra mm.
  // Không ghi đơn vị hoặc hậu tố "mm" -> coi như đã là mm, giữ nguyên.
  const isCm = /cm\s*$/i.test(str) && !/mm\s*$/i.test(str);
  const factor = isCm ? 10 : 1;

  // Đường kính: ưu tiên số ngay sau chữ D hoặc Ø ở ĐẦU chuỗi (VD "D8x10cm" -> 8);
  // nếu không có tiền tố này thì lấy số đầu tiên trong chuỗi (VD "1000x90xH10mm" -> 1000).
  const dPrefixMatch = str.match(/^\s*[DØ]\s*(\d+(?:[.,]\d+)?)/i);
  const leadMatch = str.match(/^\s*(\d+(?:[.,]\d+)?)/);
  const diameterRaw = dPrefixMatch ? dPrefixMatch[1] : (leadMatch ? leadMatch[1] : null);

  // Chiều cao: ưu tiên số ngay sau chữ H (VD "H10mm" -> 10);
  // nếu không có chữ H thì lấy số ngay sau dấu x đầu tiên (VD "D8x10cm" -> 10).
  const hPrefixMatch = str.match(/H\s*(\d+(?:[.,]\d+)?)/i);
  const xMatch = str.match(/[xX×]\s*(\d+(?:[.,]\d+)?)/);
  const heightRaw = hPrefixMatch ? hPrefixMatch[1] : (xMatch ? xMatch[1] : null);

  return {
    diameter_mm: diameterRaw !== null ? Number(diameterRaw.replace(',', '.')) * factor : null,
    height_mm: heightRaw !== null ? Number(heightRaw.replace(',', '.')) * factor : null
  };
}

function cellToValue(cell, isNumeric) {
  if (cell === null || cell === undefined) return null;
  let v = cell;
  if (typeof v === 'object') {
    if (v instanceof Date) return isNumeric ? null : v.toLocaleDateString('vi-VN');
    // exceljs có thể trả về nhiều dạng khác nhau tùy cách ô được định dạng trong Excel:
    // - { text }, { result }  : công thức
    // - { richText: [...] }   : text có nhiều định dạng (rich text) trong cùng 1 ô — rất hay gặp
    //   khi dữ liệu được copy/paste từ nguồn khác vào, và đây chính là lý do các cột text
    //   (VD: color) có thể bị đọc ra rỗng nếu không xử lý riêng trường hợp này.
    if (Array.isArray(v.richText)) {
      v = v.richText.map(rt => rt.text ?? '').join('');
    } else {
      v = v.text ?? v.result ?? v.hyperlink ?? '';
    }
  }
  const str = String(v).trim();
  if (str === '') return null;
  if (isNumeric) {
    const n = Number(str.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return str;
}

function withLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    Id: row.id,
    Order_Id: row.order_id,
    Product_Code: row.product_code,
    Size: row.size,
    Weight: row.weight,
    Wick: row.wick,
    Color: row.color,
    Fragrance: row.fragrance,
    Diameter: row.diameter_mm,
    Height: row.height_mm,
    Notes: row.notes
  };
}

function getProduct(id) {
  const row = prepare(`
    SELECT p.*, po.po_number AS po_number, c.name AS customer_name
    FROM products p
    JOIN purchase_orders po ON po.id = p.order_id
    JOIN customers c ON c.id = po.customer_id
    WHERE p.id = ?
  `).get(id);
  return withLegacy(row);
}

router.get('/', (req, res, next) => {
  try {
    let sql = `
      SELECT p.*, po.po_number AS po_number, c.name AS customer_name
      FROM products p
      JOIN purchase_orders po ON po.id = p.order_id
      JOIN customers c ON c.id = po.customer_id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.order_id) { sql += ' AND p.order_id = ?'; params.push(req.query.order_id); }
    if (req.query.product_code) { sql += ' AND p.product_code LIKE ?'; params.push(`%${req.query.product_code}%`); }
    sql += ' ORDER BY p.id DESC';
    const rows = prepare(sql).all(...params);
    res.json(rows.map(withLegacy));
  } catch (err) { next(err); }
});

router.get('/report/:orderId.xlsx', async (req, res, next) => {
  try { await generateProductOrderReportXlsx(res, req.params.orderId); }
  catch (err) { if (!res.headersSent) res.status(400).json({ error: err.message }); else next(err); }
});

router.get('/labels/:orderId.pdf', async (req, res, next) => {
  try { await generateProductLabelsPdf(res, req.params.orderId); }
  catch (err) { if (!res.headersSent) res.status(400).json({ error: err.message }); else next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = getProduct(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json(row);
  } catch (err) { next(err); }
});

function validatePayload(body, partial = false) {
  const p = {
    order_id: body.order_id !== undefined ? Number(body.order_id) : undefined,
    product_code: body.product_code !== undefined ? String(body.product_code ?? '').trim() : undefined,
    size: body.size !== undefined ? (body.size === '' ? null : String(body.size)) : undefined,
    weight: body.weight !== undefined ? body.weight : undefined,
    wick: body.wick !== undefined ? (body.wick === '' ? null : String(body.wick)) : undefined,
    color: body.color !== undefined ? (body.color === '' ? null : String(body.color)) : undefined,
    fragrance: body.fragrance !== undefined ? (body.fragrance === '' ? null : String(body.fragrance)) : undefined,
    // diameter_mm/height_mm KHÔNG nhận trực tiếp từ client nữa — luôn tự tách từ "size"
    // (xem parseSizeToDimensions), gán ngay sau khi validatePayload trả về ở POST/PUT bên dưới.
    notes: body.notes !== undefined ? (body.notes === '' ? null : String(body.notes)) : undefined
  };
  if (!partial) {
    if (!p.order_id || !p.product_code) throw new Error('order_id và product_code là bắt buộc');
  }
  if (p.weight !== undefined && p.weight !== null && p.weight !== '' && !Number.isFinite(Number(p.weight))) {
    throw new Error('weight phải là số');
  }
  if (p.weight !== undefined) p.weight = (p.weight === '' || p.weight === null) ? null : Number(p.weight);

  Object.keys(p).forEach(k => { if (p[k] === undefined) delete p[k]; });
  return p;
}

router.post('/', (req, res, next) => {
  try {
    const p = validatePayload(req.body);
    const po = prepare('SELECT id FROM purchase_orders WHERE id = ?').get(p.order_id);
    if (!po) return res.status(400).json({ error: 'PO không tồn tại' });

    const dims = parseSizeToDimensions(p.size);

    const r = prepare(`INSERT INTO products
      (order_id, product_code, size, weight, wick, color, fragrance, diameter_mm, height_mm, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      p.order_id, p.product_code, p.size ?? null, p.weight ?? null, p.wick ?? null,
      p.color ?? null, p.fragrance ?? null, dims.diameter_mm, dims.height_mm, p.notes ?? null
    );
    res.status(201).json(getProduct(r.lastInsertRowid));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const p = validatePayload(req.body, true);
    const merged = { ...existing, ...p };
    // size đổi (hoặc giữ nguyên) -> luôn tính lại diameter_mm/height_mm theo size mới nhất.
    const dims = parseSizeToDimensions(merged.size);
    merged.diameter_mm = dims.diameter_mm;
    merged.height_mm = dims.height_mm;

    if (p.order_id) {
      const po = prepare('SELECT id FROM purchase_orders WHERE id = ?').get(p.order_id);
      if (!po) return res.status(400).json({ error: 'PO không tồn tại' });
    }

    prepare(`UPDATE products SET order_id=?, product_code=?, size=?, weight=?, wick=?, color=?,
      fragrance=?, diameter_mm=?, height_mm=?, notes=? WHERE id=?`).run(
      merged.order_id, merged.product_code, merged.size, merged.weight, merged.wick, merged.color,
      merged.fragrance, merged.diameter_mm, merged.height_mm, merged.notes, req.params.id
    );
    res.json(getProduct(req.params.id));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const r = prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ---------- Import từ file Excel ----------
// Import tự động từ Excel theo cột cố định:
// A = Tên khách hàng, B = Tên đơn hàng/PO, G = Mã hàng,
// M = Size, S = Weight, X = Wick, Y = Color, AB = Fragrance.
// Nếu khách hàng hoặc PO chưa tồn tại -> tự tạo.
// Nếu mã hàng chưa tồn tại trong PO -> tự tạo; nếu đã tồn tại -> bỏ qua để tránh trùng.
const AUTO_IMPORT_COLUMN_MAP = [
  ['A', 'customer_name'],
  ['B', 'po_number'],
  ['G', 'product_code'],
  ['M', 'size'],
  ['S', 'weight'],
  ['X', 'wick'],
  ['Y', 'color'],
  ['AB', 'fragrance']
];
const AUTO_IMPORT_INDEXES = AUTO_IMPORT_COLUMN_MAP.map(([letter, field]) => [colLetterToIndex(letter), field]);

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file Excel' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'File Excel không có sheet nào' });

    const rows = [];
    const skipped = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // dòng tiêu đề
      const rec = {};
      for (const [colIndex, field] of AUTO_IMPORT_INDEXES) {
        rec[field] = cellToValue(row.getCell(colIndex).value, field === 'weight');
      }
      if (!rec.customer_name || !rec.po_number || !rec.product_code) {
        skipped.push({ row: rowNumber, reason: 'Thiếu tên khách hàng, tên đơn hàng/PO hoặc mã hàng' });
        return;
      }
      const dims = parseSizeToDimensions(rec.size);
      rec.diameter_mm = dims.diameter_mm;
      rec.height_mm = dims.height_mm;
      rows.push({ ...rec, rowNumber });
    });

    if (!rows.length) {
      return res.status(400).json({ error: 'Không tìm thấy dòng dữ liệu hợp lệ. Cần có A=khách hàng, B=đơn hàng/PO và G=mã hàng.' });
    }

    let createdCustomers = 0;
    let createdPOs = 0;
    let imported = 0;
    let existing = 0;

    transaction(() => {
      const getCustomer = prepare('SELECT id FROM customers WHERE name = ?');
      const insertCustomer = prepare('INSERT INTO customers (name) VALUES (?)');
      const getPO = prepare('SELECT id FROM purchase_orders WHERE customer_id = ? AND po_number = ?');
      const insertPO = prepare('INSERT INTO purchase_orders (customer_id, po_number) VALUES (?, ?)');
      const getProduct = prepare('SELECT id FROM products WHERE order_id = ? AND product_code = ?');
      const insertProduct = prepare(`INSERT INTO products
        (order_id, product_code, size, weight, wick, color, fragrance, diameter_mm, height_mm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      const customerIds = new Map();
      const poIds = new Map();

      for (const rec of rows) {
        const customerKey = rec.customer_name.trim();
        const poKey = `${customerKey}\u0000${rec.po_number.trim()}`;

        let customerId = customerIds.get(customerKey);
        if (!customerId) {
          let customer = getCustomer.get(customerKey);
          if (!customer) {
            const r = insertCustomer.run(customerKey);
            customerId = Number(r.lastInsertRowid);
            createdCustomers++;
          } else {
            customerId = Number(customer.id);
          }
          customerIds.set(customerKey, customerId);
        }

        let orderId = poIds.get(poKey);
        if (!orderId) {
          let po = getPO.get(customerId, rec.po_number.trim());
          if (!po) {
            const r = insertPO.run(customerId, rec.po_number.trim());
            orderId = Number(r.lastInsertRowid);
            createdPOs++;
          } else {
            orderId = Number(po.id);
          }
          poIds.set(poKey, orderId);
        }

        const found = getProduct.get(orderId, rec.product_code.trim());
        if (found) {
          existing++;
          skipped.push({ row: rec.rowNumber, reason: `Mã hàng ${rec.product_code.trim()} đã tồn tại trong PO ${rec.po_number.trim()}` });
          continue;
        }

        insertProduct.run(orderId, rec.product_code.trim(), rec.size, rec.weight, rec.wick,
          rec.color, rec.fragrance, rec.diameter_mm, rec.height_mm);
        imported++;
      }
    });

    res.status(201).json({
      imported,
      existing,
      created_customers: createdCustomers,
      created_pos: createdPOs,
      skipped_rows: skipped
    });
  } catch (err) { next(err); }
});

module.exports = router;
