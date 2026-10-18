// lib/sampleLabelReportXlsx.js
// Xuất tem cho nhật ký test đốt hàng mẫu ra Excel (.xlsx) — layout A5 ngang:
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
  ['Trọng Lượng', '重量 / Net weight', 'weight'],
  ['Thời gian đốt', '时间 / Burning Time', 'burn_time']
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

function getSampleTests(ids) {
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).filter(n => n > 0) : [];
  if (!list.length) return [];
  const placeholders = list.map(() => '?').join(',');
  return prepare(`SELECT s.*, c.name AS customer_name, po.po_number
    FROM sample_burn_tests s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN purchase_orders po ON po.id = s.purchase_order_id
    WHERE s.id IN (${placeholders})
    ORDER BY s.test_date DESC, s.id DESC`).all(...list);
}

function sampleToLabel(test) {
  return {
    order_no: str(test.po_number),
    product_name: str(test.product_name || test.product_code),
    color: '',
    wick: str(test.wick_spec),
    size: convertSizeToMm(test.size || test.product_name || ''),
    weight: test.weight == null || test.weight === '' ? '' : `${formatNumber(test.weight)} g`,
    burn_time: str(test.total_burn_time || test.burn_total_seconds || '')
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
    vc.font = {
      name: 'Times New Roman',
      bold: true,
      size: v.length > 30 ? 10 : 13
    };
    vc.border = bd;
  });
}

async function generateSampleLabelsXlsx(res, ids, filenameHint) {
  const tests = getSampleTests(ids);
  if (!tests.length) throw new Error('Không tìm thấy hồ sơ test đốt nào để in tem');

  const labels = tests.map(sampleToLabel);

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

module.exports = { generateSampleLabelsXlsx };
