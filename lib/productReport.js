const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { prepare, UPLOADS_DIR } = require('../database/database');

const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'MAU_BURN_TEST_REPORT.xlsx');
const FONT_NORMAL = path.join(__dirname, '..', 'assets', 'time.ttf');

// ============================================================
// HELPERS
// ============================================================
function safeSheetName(name, used) {
  let s = String(name || 'MAU').replace(/[\\/*?:\[\]]/g, '_').trim() || 'MAU';
  s = s.slice(0, 31);
  let base = s, n = 2;
  while (used.has(s)) {
    const suffix = `_${n++}`;
    s = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(s);
  return s;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function f(v) { return v == null ? '' : v; }
function celsiusToF(c) { const n = toNumber(c); return n == null ? null : n * 9 / 5 + 32; }

// Chuyển "AB12" → {row: 12, col: 28}
function decodeCellAddress(addr) {
  const m = String(addr).match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row: Number(m[2]), col };
}

// Clone range ảnh an toàn (tránh circular structure)
function cloneImageRange(rng) {
  if (!rng || typeof rng !== 'object') return null;
  const out = {};
  if (rng.tl && typeof rng.tl === 'object') {
    out.tl = {};
    ['col', 'row', 'nativeCol', 'nativeRow', 'nativeColOff', 'nativeRowOff'].forEach(k => {
      if (rng.tl[k] !== undefined) out.tl[k] = rng.tl[k];
    });
  }
  if (rng.br && typeof rng.br === 'object') {
    out.br = {};
    ['col', 'row', 'nativeCol', 'nativeRow', 'nativeColOff', 'nativeRowOff'].forEach(k => {
      if (rng.br[k] !== undefined) out.br[k] = rng.br[k];
    });
  }
  if (rng.ext && typeof rng.ext === 'object') {
    out.ext = { width: rng.ext.width, height: rng.ext.height };
  }
  if (rng.editAs) out.editAs = rng.editAs;
  return out;
}

// ============================================================
// DATABASE QUERIES
// ============================================================
function getOrder(orderId) {
  return prepare(`SELECT po.id, po.po_number, c.name AS customer_name 
    FROM purchase_orders po 
    JOIN customers c ON c.id = po.customer_id 
    WHERE po.id = ?`).get(orderId);
}
function getProducts(orderId) {
  return prepare(`SELECT * FROM products WHERE order_id = ? ORDER BY product_code COLLATE NOCASE`).all(orderId);
}
function getLatestTest(orderId, productCode) {
  return prepare(`SELECT bt.*, po.po_number, c.name AS customer_name
    FROM burn_tests bt 
    JOIN purchase_orders po ON po.id = bt.purchase_order_id 
    JOIN customers c ON c.id = po.customer_id
    WHERE bt.purchase_order_id = ? AND bt.product_code = ? 
    ORDER BY bt.test_date DESC, bt.id DESC LIMIT 1`).get(orderId, productCode);
}
function getLogs(testId) {
  if (!testId) return [];
  return prepare(`SELECT * FROM burn_test_logs WHERE burn_test_id = ? ORDER BY created_at, id`).all(testId);
}
function getPhotos(testId) {
  if (!testId) return [];
  return prepare(`SELECT * FROM burn_test_photos WHERE burn_test_id = ? ORDER BY slot`).all(testId);
}
function photoPath(fileName) {
  if (!fileName) return null;
  return path.join(UPLOADS_DIR, ...String(fileName).split('/'));
}

function setCell(ws, address, value, opts = {}) {
  const cell = ws.getCell(address);
  cell.value = value;
  if (opts.font) cell.font = { ...cell.font, ...opts.font };
  if (opts.alignment) cell.alignment = { ...cell.alignment, ...opts.alignment };
}

// ============================================================
// COPY SHEET TEMPLATE — GIỮ NGUYÊN 100% FORM MẪU
// ============================================================
async function copySheetTemplate(wb, source, name) {
  const ws = wb.addWorksheet(name);

  // ===== 1. Metadata =====
  ws.properties = { ...source.properties };
  if (source.pageSetup)    ws.pageSetup    = JSON.parse(JSON.stringify(source.pageSetup));
  if (source.pageMargins)  ws.pageMargins  = JSON.parse(JSON.stringify(source.pageMargins));
  if (source.headerFooter) ws.headerFooter = JSON.parse(JSON.stringify(source.headerFooter));
  if (source.views)        ws.views        = JSON.parse(JSON.stringify(source.views));
  if (source.sheetFormat)  ws.sheetFormat  = JSON.parse(JSON.stringify(source.sheetFormat));

  // ===== 2. Column widths + hidden =====
  for (let c = 1; c <= source.columnCount; c++) {
    const srcCol = source.getColumn(c);
    const dstCol = ws.getColumn(c);
    if (srcCol.width != null) dstCol.width = srcCol.width;
    if (srcCol.hidden)        dstCol.hidden = srcCol.hidden;
    if (srcCol.outlineLevel)  dstCol.outlineLevel = srcCol.outlineLevel;
  }

  // ===== 3. Row heights + hidden =====
  for (let r = 1; r <= source.rowCount; r++) {
    const srcRow = source.getRow(r);
    const dstRow = ws.getRow(r);
    if (srcRow.height != null) dstRow.height = srcRow.height;
    if (srcRow.hidden)         dstRow.hidden = srcRow.hidden;
    if (srcRow.outlineLevel)   dstRow.outlineLevel = srcRow.outlineLevel;
  }

  // ===== 4. Copy value + style TỪNG CELL (TRƯỚC khi merge) =====
  for (let r = 1; r <= source.rowCount; r++) {
    for (let c = 1; c <= source.columnCount; c++) {
      const srcCell = source.getCell(r, c);
      const dstCell = ws.getCell(r, c);

      // Value
      const v = srcCell.value;
      if (v !== undefined && v !== null) {
        if (typeof v === 'object') {
          dstCell.value = JSON.parse(JSON.stringify(v));
        } else {
          dstCell.value = v;
        }
      }

      // Style (deep clone, không share reference)
      if (srcCell.style) {
        try {
          dstCell.style = JSON.parse(JSON.stringify(srcCell.style));
        } catch (_) {
          if (srcCell.font)       dstCell.font       = JSON.parse(JSON.stringify(srcCell.font));
          if (srcCell.fill)       dstCell.fill       = JSON.parse(JSON.stringify(srcCell.fill));
          if (srcCell.alignment)  dstCell.alignment  = JSON.parse(JSON.stringify(srcCell.alignment));
          if (srcCell.border)     dstCell.border     = JSON.parse(JSON.stringify(srcCell.border));
          if (srcCell.numFmt)     dstCell.numFmt     = srcCell.numFmt;
          if (srcCell.protection) dstCell.protection = JSON.parse(JSON.stringify(srcCell.protection));
        }
      }
    }
  }

  // ===== 5. Lấy danh sách merges =====
  const merges = Array.isArray(source.model?.merges)
    ? source.model.merges
    : (source._merges ? Object.keys(source._merges) : []);

  // ===== 6. Merge + gộp border cho MASTER cell =====
  for (const range of merges) {
    try {
      const [startAddr, endAddr] = String(range).split(':');
      if (!startAddr) continue;

      const start = decodeCellAddress(startAddr);
      const end   = endAddr ? decodeCellAddress(endAddr) : start;
      if (!start || !end) continue;

      // Gộp border từ TẤT CẢ cells trong vùng
      let topBorder, bottomBorder, leftBorder, rightBorder;
      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          const sc = source.getCell(r, c);
          if (!sc || !sc.border) continue;
          const b = sc.border;
          if (r === start.row && b.top && !topBorder)       topBorder    = b.top;
          if (r === end.row   && b.bottom && !bottomBorder) bottomBorder = b.bottom;
          if (c === start.col && b.left && !leftBorder)     leftBorder   = b.left;
          if (c === end.col   && b.right && !rightBorder)   rightBorder  = b.right;
        }
      }

      // Merge
      try { ws.mergeCells(range); } catch (_) {}

      // Áp border gộp vào master cell
      const masterCell = ws.getCell(startAddr);
      const mergedBorder = {};
      if (topBorder)    mergedBorder.top    = JSON.parse(JSON.stringify(topBorder));
      if (bottomBorder) mergedBorder.bottom = JSON.parse(JSON.stringify(bottomBorder));
      if (leftBorder)   mergedBorder.left   = JSON.parse(JSON.stringify(leftBorder));
      if (rightBorder)  mergedBorder.right  = JSON.parse(JSON.stringify(rightBorder));

      if (Object.keys(mergedBorder).length) {
        const oldB = masterCell.border || {};
        masterCell.border = { ...oldB, ...mergedBorder };
      }
    } catch (_) {}
  }

  // ===== 7. Data validation (dropdown) =====
  try {
    const dvModel = source.dataValidations?.model;
    if (dvModel) {
      for (const key in dvModel) {
        try {
          ws.getCell(key).dataValidation = JSON.parse(JSON.stringify(dvModel[key]));
        } catch (_) {}
      }
    }
  } catch (_) {}

  return ws;
}

// ============================================================
// FILL TEMPLATE — điền dữ liệu vào các ô cố định
// ============================================================
function fillTemplate(ws, product, order, test, logs) {
  // Header
  setCell(ws, 'C5', order.po_number);
  setCell(ws, 'N5', product.product_code);
  setCell(ws, 'C6', order.customer_name);
  setCell(ws, 'N6', toNumber(product.diameter_mm));
  setCell(ws, 'S6', toNumber(product.height_mm));
  setCell(ws, 'C7', product.fragrance);
  setCell(ws, 'N7', test?.temperature_c ?? '');
  setCell(ws, 'C8', product.color);
  setCell(ws, 'C9', product.wick);
  setCell(ws, 'C10', 'đốt cháy');

  // Xóa sạch vùng log cũ trước khi ghi
  const maxRows = 52;
  for (let i = 0; i < maxRows; i++) {
    const row = 18 + i;
    // Cột B của mẫu chứa số thứ tự 1-52, không được xóa khi làm mới log.
    for (const c of [1, 3, 4, 5, 6, 7, 8]) {
      ws.getCell(row, c).value = null;
    }
  }

  // Ghi log mới
  for (let i = 0; i < Math.min(logs.length, maxRows); i++) {
    const row = 18 + i, log = logs[i];
    ws.getCell(row, 1).value = f(log.time_label);
    ws.getCell(row, 3).value = f(log.wick_status);
    ws.getCell(row, 4).value = f(log.flame_status);
    ws.getCell(row, 5).value = toNumber(log.wick_height_mm);
    ws.getCell(row, 6).value = f(log.vessel_condition);
    ws.getCell(row, 7).value = toNumber(log.temperature_c);
    ws.getCell(row, 8).value = celsiusToF(log.temperature_c);
  }
}

// ============================================================
// BUILD REPORT
// ============================================================
async function buildProductOrderReport(orderId) {
  if (!fs.existsSync(TEMPLATE_PATH)) throw new Error('Không tìm thấy mẫu báo cáo MAU.xlsx');
  const order = getOrder(orderId);
  if (!order) throw new Error('Không tìm thấy Đơn hàng/PO');
  const products = getProducts(orderId);
  if (!products.length) throw new Error('Đơn hàng chưa có mã sản phẩm');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const template = wb.worksheets[0];

  // ===== CACHE ẢNH GỐC TỪ TEMPLATE (LOGO) =====
  const cachedImages = [];
  try {
    const srcImages = template.getImages ? template.getImages() : [];
    console.log('[report] Số ảnh trong template:', srcImages.length);
    for (const img of srcImages) {
      const media = wb.model.media.find(m =>
        m.index === img.imageId ||
        m.id === img.imageId ||
        (img.imageId && typeof img.imageId === 'object' && m.index === img.imageId.index)
      );
      if (media && media.buffer) {
        const safeRange = cloneImageRange(img.range);
        if (safeRange && (safeRange.tl || safeRange.ext)) {
          cachedImages.push({
            buffer: Buffer.from(media.buffer),
            extension: media.extension || 'png',
            range: safeRange
          });
        }
      }
    }
    console.log('[report] Đã cache ảnh:', cachedImages.length);
  } catch (e) {
    console.error('[report] Cache ảnh lỗi:', e);
  }

  // Đổi tên template để không bị trùng
  const originalTemplateName = template.name;
  template.name = '_TEMPLATE_';

  const used = new Set();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const name = safeSheetName(p.product_code, used);

    // Copy sheet từ template (giữ nguyên 100% form mẫu)
    const ws = await copySheetTemplate(wb, template, name);
    used.add(name);

    const test = getLatestTest(orderId, p.product_code);
    const logs = getLogs(test?.id);

    fillTemplate(ws, p, order, test, logs);

    // ===== THÊM ẢNH LOGO (từ cache template) VÀO SHEET =====
    for (const c of cachedImages) {
      try {
        const newId = wb.addImage({ buffer: c.buffer, extension: c.extension });
        ws.addImage(newId, c.range);
      } catch (err) {
        console.error('[report] addImage fail:', err);
      }
    }

    // KHÔNG ghi đè pageSetup — giữ nguyên A4 dọc từ template
  }

  // Ẩn sheet template (không xóa — tránh mất media)
  try { template.state = 'hidden'; } catch (_) {}

  return wb;
}

// ============================================================
// EXPORT ROUTE
// ============================================================
async function generateProductOrderReportXlsx(res, orderId) {
  const wb = await buildProductOrderReport(Number(orderId));
  const order = getOrder(Number(orderId));
  const safe = String(order.po_number).replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}_BaoCao.xlsx`)}`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { generateProductOrderReportXlsx };