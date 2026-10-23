// lib/labelReportXlsx.js
// Xuất tem sản phẩm ra Excel (.xlsx) — layout tương tự bản PDF A5 ngang:
// 9 tem / trang (3 cột x 3 hàng), mỗi tem 8 dòng (1 tiêu đề + 7 thông tin).
const ExcelJS = require('exceljs');
const { prepare } = require('../database/database');

// Cấu trúc mỗi tem: [Nhãn tiếng Việt, Tiêu đề (Trung + Anh), key trong item]
const FIELDS = [
  ['', 'ISUN PRODUCTS VIET NAM CO.,LTD  ', ''],
  ['Mã đơn hàng', '订单编号 / Order No.', 'order_no'],
  ['Mã SP', '货号 / Item', 'product_name'],
  ['Màu sắc', '颜色 / Wax color', 'color'],
  ['Bấc nến', '灯芯类型 / Wick Type', 'wick'],
  ['Kích thước', '直径 / Size [mm]', 'size'],
  ['Trọng Lượng', '重量 / Net weight', 'weight']
];

const ROWS_PER_LABEL  = FIELDS.length;
const LABEL_ROW_SPAN  = ROWS_PER_LABEL + 1;
const LABELS_PER_ROW  = 3;                          // 3 tem / hàng
const LABELS_PER_PAGE = LABELS_PER_ROW * 3;         // 3x3 = 9 tem / trang
const COL_STARTS      = [1, 4, 7];                  // cột bắt đầu mỗi tem: [label, value, gap] x 3
const ROW_HEIGHT      = 20;                         // chiều cao mỗi dòng (pt)

// ---------- Helpers (giống labelReport.js để độc lập) ----------
function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function formatNumber(v) {
  const n = num(v); if (n == null) return '';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
function convertSizeToMm(value) {
  const s = str(value);
  if (!s || /mm/i.test(s)) return s;
  if (!/cm/i.test(s)) return s;
  const converted = s.replace(/\d+(?:[.,]\d+)?/g, m => {
    const n = Number(m.replace(',', '.')) * 10;
    return formatNumber(n);
  }).replace(/\s*cm\s*/ig, '').trim();
  return /mm$/i.test(converted) ? converted : `${converted}mm`;
}
function safeFilePart(v) {
  return String(v || 'data').replace(/[\\/:*?"<>|]/g, '_').trim() || 'data';
}
function getOrder(orderId) {
  return prepare(`SELECT po.id, po.po_number, c.name AS customer_name
    FROM purchase_orders po JOIN customers c ON c.id=po.customer_id WHERE po.id=?`).get(orderId);
}
function getProducts(orderId) {
  return prepare(`SELECT * FROM products WHERE order_id=? ORDER BY product_code COLLATE NOCASE`).all(orderId);
}
function productToLabel(product, order) {
  return {
    order_no: str(product.po_number || order.po_number),
    product_name: str(product.product_code),
    color: str(product.color),
    wick: str(product.wick),
    size: convertSizeToMm(product.size),
    weight: product.weight == null || product.weight === ''
      ? '' : `${formatNumber(product.weight)} g`
  };
}

// ---------- Vẽ 1 tem vào sheet ----------
function makeBorder() {
  const s = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, bottom: s, left: s, right: s };
}

function drawLabelOnSheet(sheet, item, startRow, labelCol, bd) {
  const valueCol = labelCol + 1;

  FIELDS.forEach(([vnLabel, title, key], i) => {
    const r = startRow + i;
    sheet.getRow(r).height = ROW_HEIGHT;

    // -------- Dòng tiêu đề chung (merge 2 cột) --------
    if (!key) {
      try { sheet.mergeCells(r, labelCol, r, valueCol); } catch (_) {}
      const master = sheet.getCell(r, labelCol);
      master.value = title;
      master.alignment = { horizontal: 'center', vertical: 'middle' };
      master.font = { name: 'Times New Roman', bold: true, size: 11 };
      master.border = bd;
      // Border cho ô slave (sau merge vẫn set được)
      try { sheet.getCell(r, valueCol).border = bd; } catch (_) {}
      return;
    }

    // -------- Cột nhãn (label) --------
    const lc = sheet.getCell(r, labelCol);
    lc.value = title;
    lc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    lc.font = { name: 'Times New Roman', bold: true, size: 8 };
    lc.border = bd;

    // -------- Cột giá trị --------
    const vc = sheet.getCell(r, valueCol);
    const v = item ? str(item[key]) : '';
    vc.value = v || '';
    vc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    // Tự thu nhỏ cỡ chữ theo độ dài để không tràn khung
    let fsize = 13;
    if (v.length > 12) fsize = 12;
    if (v.length > 18) fsize = 11;
    if (v.length > 24) fsize = 10;
    if (v.length > 32) fsize = 9;
    if (v.length > 40) fsize = 8;
    vc.font = {
      name: 'Times New Roman',
      bold: true,
      size: fsize
    };
    vc.border = bd;
  });
}

// ---------- Entry point ----------
async function generateProductLabelsXlsx(res, orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('PO không hợp lệ');

  const order = getOrder(id);
  if (!order) throw new Error('Không tìm thấy Đơn hàng/PO');

  const products = getProducts(id);
  if (!products.length) throw new Error('Đơn hàng chưa có mã sản phẩm');

  const labels = products.map(p => productToLabel(p, order));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Burn Test QC';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Tem sản phẩm', {
    pageSetup: {
      paperSize: 11,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.15, right: 0.15, top: 0.15, bottom: 0.15, header: 0, footer: 0 }
    },
    views: [{ showGridLines: false }]
  });

  const widths = [13, 22, 1.5, 13, 22, 1.5, 13, 22];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const bd = makeBorder();
  const totalLabels = labels.length;
  const pages = Math.max(1, Math.ceil(totalLabels / LABELS_PER_PAGE));

  for (let p = 0; p < pages; p++) {
    const pageBaseRow = p * (LABEL_ROW_SPAN * 3) + 1;

    for (let i = 0; i < LABELS_PER_PAGE; i++) {
      const idx = p * LABELS_PER_PAGE + i;
      const rowInPage = Math.floor(i / LABELS_PER_ROW);
      const colInPage = i % LABELS_PER_ROW;

      const startRow = pageBaseRow + rowInPage * LABEL_ROW_SPAN;
      const startCol = COL_STARTS[colInPage];

      const item = idx < totalLabels ? labels[idx] : null;
      drawLabelOnSheet(sheet, item, startRow, startCol, bd);
    }

    if (p < pages - 1) {
      const breakRow = pageBaseRow + LABEL_ROW_SPAN * 3 - 1;
      try { sheet.getRow(breakRow).addPageBreak(); } catch (_) {}
    }
  }

  const safe = safeFilePart(order.po_number);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}_InTem.xlsx`)}`);

  await wb.xlsx.write(res);
  res.end();
}

async function generateProductLabelsXlsxForIds(res, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Chưa chọn sản phẩm để in tem');
  const uniqueIds = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new Error('Danh sách sản phẩm không hợp lệ');

  const products = prepare(`SELECT p.*, po.po_number, c.name AS customer_name
    FROM products p
    JOIN purchase_orders po ON po.id = p.order_id
    JOIN customers c ON c.id = po.customer_id
    WHERE p.id IN (${uniqueIds.map(() => '?').join(',')})
    ORDER BY p.product_code COLLATE NOCASE`).all(...uniqueIds);
  if (!products.length) throw new Error('Không tìm thấy sản phẩm cần in tem');

  const order = { id: products[0].order_id, po_number: products[0].po_number, customer_name: products[0].customer_name };
  const labels = products.map(p => productToLabel(p, order));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Burn Test QC';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Tem sản phẩm', {
    pageSetup: {
      paperSize: 11,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.15, right: 0.15, top: 0.15, bottom: 0.15, header: 0, footer: 0 }
    },
    views: [{ showGridLines: false }]
  });

  const widths = [13, 22, 1.5, 13, 22, 1.5, 13, 22];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const bd = makeBorder();
  const totalLabels = labels.length;
  const pages = Math.max(1, Math.ceil(totalLabels / LABELS_PER_PAGE));

  for (let p = 0; p < pages; p++) {
    const pageBaseRow = p * (LABEL_ROW_SPAN * 3) + 1;

    for (let i = 0; i < LABELS_PER_PAGE; i++) {
      const idx = p * LABELS_PER_PAGE + i;
      const rowInPage = Math.floor(i / LABELS_PER_ROW);
      const colInPage = i % LABELS_PER_ROW;

      const startRow = pageBaseRow + rowInPage * LABEL_ROW_SPAN;
      const startCol = COL_STARTS[colInPage];
      const item = idx < totalLabels ? labels[idx] : null;
      drawLabelOnSheet(sheet, item, startRow, startCol, bd);
    }

    if (p < pages - 1) {
      const breakRow = pageBaseRow + LABEL_ROW_SPAN * 3 - 1;
      try { sheet.getRow(breakRow).addPageBreak(); } catch (_) {}
    }
  }

  const safe = safeFilePart(order.po_number || 'selected');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}_Selected_InTem.xlsx`)}`);

  await wb.xlsx.write(res);
  res.end();
}

async function generateProductLabelsXlsxForPoIds(res, poIds) {
  const uniqueIds = [...new Set((poIds || []).map(n => Number(n)).filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new Error('PO không hợp lệ');

  const products = prepare(`SELECT p.*, po.po_number, c.name AS customer_name
    FROM products p
    JOIN purchase_orders po ON po.id = p.order_id
    JOIN customers c ON c.id = po.customer_id
    WHERE p.order_id IN (${uniqueIds.map(() => '?').join(',')})
    ORDER BY po.po_number COLLATE NOCASE, p.product_code COLLATE NOCASE`).all(...uniqueIds);
  if (!products.length) throw new Error('Không tìm thấy sản phẩm nào trong các PO đã chọn');

  const labels = products.map(p => productToLabel(p, { po_number: p.po_number, customer_name: p.customer_name }));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Burn Test QC';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Tem sản phẩm', {
    pageSetup: {
      paperSize: 11,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.15, right: 0.15, top: 0.15, bottom: 0.15, header: 0, footer: 0 }
    },
    views: [{ showGridLines: false }]
  });

  const widths = [13, 22, 1.5, 13, 22, 1.5, 13, 22];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const bd = makeBorder();
  const totalLabels = labels.length;
  const pages = Math.max(1, Math.ceil(totalLabels / LABELS_PER_PAGE));

  for (let p = 0; p < pages; p++) {
    const pageBaseRow = p * (LABEL_ROW_SPAN * 3) + 1;

    for (let i = 0; i < LABELS_PER_PAGE; i++) {
      const idx = p * LABELS_PER_PAGE + i;
      const rowInPage = Math.floor(i / LABELS_PER_ROW);
      const colInPage = i % LABELS_PER_ROW;

      const startRow = pageBaseRow + rowInPage * LABEL_ROW_SPAN;
      const startCol = COL_STARTS[colInPage];
      const item = idx < totalLabels ? labels[idx] : null;
      drawLabelOnSheet(sheet, item, startRow, startCol, bd);
    }

    if (p < pages - 1) {
      const breakRow = pageBaseRow + LABEL_ROW_SPAN * 3 - 1;
      try { sheet.getRow(breakRow).addPageBreak(); } catch (_) {}
    }
  }

  const safe = uniqueIds.length > 1 ? 'multi_po' : safeFilePart(products[0].po_number || 'selected');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}_InTem.xlsx`)}`);

  await wb.xlsx.write(res);
  res.end();
}

module.exports = { generateProductLabelsXlsx, generateProductLabelsXlsxForIds, generateProductLabelsXlsxForPoIds };