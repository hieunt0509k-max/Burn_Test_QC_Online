// lib/burnTestLabelReportXlsx.js
// Xuất tem cho nhật ký test đốt ra Excel (.xlsx) — layout A5 ngang:
// 9 tem / trang (3 cột x 3 hàng), mỗi tem 8 dòng (1 tiêu đề + 7 thông tin).
const ExcelJS = require('exceljs');
const { prepare } = require('../database/database');

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
const LABELS_PER_ROW  = 3;
const LABELS_PER_PAGE = LABELS_PER_ROW * 3;
const COL_STARTS      = [1, 4, 7];
const ROW_HEIGHT      = 20;

function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function formatNumber(v) {
  const n = num(v); if (n == null) return '';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
function safeFilePart(v) {
  return String(v || 'data').replace(/[\\/:*?"<>|]/g, '_').trim() || 'data';
}

function getBurnTests(ids) {
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).filter(n => n > 0) : [];
  if (!list.length) return [];
  const placeholders = list.map(() => '?').join(',');
  return prepare(`SELECT bt.*, c.name AS customer_name, po.po_number, p.weight AS product_weight, p.size AS product_size
    FROM burn_tests bt
    LEFT JOIN purchase_orders po ON po.id = bt.purchase_order_id
    LEFT JOIN customers c ON c.id = po.customer_id
    LEFT JOIN products p ON p.order_id = bt.purchase_order_id AND p.product_code = bt.product_code
    WHERE bt.id IN (${placeholders})
    ORDER BY bt.test_date DESC, bt.id DESC`).all(...list);
}

function buildSize(test) {
  const d = num(test.diameter_mm);
  const h = num(test.height_mm);
  if (d != null && h != null) return `${formatNumber(d)} x ${formatNumber(h)} mm`;
  if (d != null) return `${formatNumber(d)} mm`;
  if (h != null) return `${formatNumber(h)} mm`;
  return '';
}

function burnTestToLabel(test) {
  return {
    order_no: str(test.po_number),
    product_name: str(test.product_code),
    color: str(test.color),
    wick: str(test.wick),
    size: buildSize(test),
    weight: test.product_weight == null || test.product_weight === '' ? '' : `${formatNumber(test.product_weight)} g`
  };
}

function makeBorder() {
  const s = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, bottom: s, left: s, right: s };
}

function drawLabelOnSheet(sheet, item, startRow, labelCol, bd) {
  const valueCol = labelCol + 1;

  FIELDS.forEach(([vnLabel, title, key], i) => {
    const r = startRow + i;
    sheet.getRow(r).height = ROW_HEIGHT;

    if (!key) {
      try { sheet.mergeCells(r, labelCol, r, valueCol); } catch (_) {}
      const master = sheet.getCell(r, labelCol);
      master.value = title;
      master.alignment = { horizontal: 'center', vertical: 'middle' };
      master.font = { name: 'Times New Roman', bold: true, size: 11 };
      master.border = bd;
      try { sheet.getCell(r, valueCol).border = bd; } catch (_) {}
      return;
    }

    const lc = sheet.getCell(r, labelCol);
    lc.value = title;
    lc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    lc.font = { name: 'Times New Roman', bold: true, size: 8 };
    lc.border = bd;

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

async function generateBurnTestLabelsXlsx(res, ids, filenameHint) {
  const tests = getBurnTests(ids);
  if (!tests.length) throw new Error('Không tìm thấy hồ sơ test đốt nào để in tem');

  const labels = tests.map(burnTestToLabel);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Burn Test QC';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Tem test đốt', {
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

  const safe = safeFilePart(filenameHint || 'Tem_TestDot');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}.xlsx`)}`
  );

  await wb.xlsx.write(res);
  res.end();
}

module.exports = { generateBurnTestLabelsXlsx };
