// lib/sampleLabelReport.js
// Xuất tem cho nhật ký test đốt hàng mẫu ra PDF — layout A5 ngang giống tem sản phẩm:
// 9 tem / trang (3 cột x 3 hàng), mỗi tem 8 dòng (1 tiêu đề + 7 thông tin).
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { prepare } = require('../database/database');

const FONT_NORMAL = path.join(__dirname, '..', 'assets', 'time.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'time.ttf');

const MM = 72 / 25.4;
const A5_LANDSCAPE = { width: 210 * MM, height: 148 * MM };
const LAYOUT = {
  labelWidth: 67.5 * MM,
  labelHeight: 46.5 * MM,
  gapX: 1 * MM,
  gapY: 1 * MM,
  rows: 8,
  colW: 29 * MM,
  perPage: 9,
  cols: 3
};

// Cấu trúc mỗi tem: [Nhãn tiếng Việt, Tiêu đề (Trung + Anh), key trong item]
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

function safeFilePart(v) {
  return String(v || 'data').replace(/[\\/:*?"<>|]/g, '_').trim() || 'data';
}
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

function drawWatermark(doc, cx, cy) {
  doc.save();
  doc.opacity(0.12);
  doc.font(FONT_BOLD).fontSize(20);
  doc.rotate(45, { origin: [cx, cy] });
  doc.text('iSUN', cx - 30, cy - 10, { width: 60, align: 'center', lineBreak: false });
  doc.restore();
}

function drawLabel(doc, item, x0, y0) {
  const { labelWidth: LW, labelHeight: LH, rows, colW: CW } = LAYOUT;
  const RH = LH / rows;
  const pad = 1.2;

  drawWatermark(doc, x0 + LW / 2, y0 + LH / 2);

  doc.save();
  doc.opacity(1);
  doc.lineWidth(0.5).strokeColor('#000');
  doc.rect(x0, y0, LW, LH).stroke();

  for (let r = 1; r < rows; r++) {
    doc.moveTo(x0, y0 + r * RH).lineTo(x0 + LW, y0 + r * RH).stroke();
  }

  FIELDS.forEach(([label, title, key], i) => {
    const top = y0 + i * RH;

    if (!key) {
      doc.font(FONT_BOLD).fontSize(9).fillColor('#000');
      doc.text(title, x0, top + (RH - 12) / 2, {
        width: LW,
        align: 'center',
        lineBreak: false
      });
      return;
    }

    doc.font(FONT_BOLD).fontSize(6.5).fillColor('#000');
    doc.text(title, x0 + 1, top + (RH - 8) / 2, {
      width: CW - 2,
      height: RH,
      align: 'center',
      lineBreak: false
    });

    doc.moveTo(x0 + CW, y0 + i * RH).lineTo(x0 + CW, y0 + (i + 1) * RH).stroke();

    if (item) {
      const value = str(item[key]);
      if (value) {
        const size = value.length <= 30 ? 13 : 10;
        doc.font(FONT_BOLD).fontSize(size);
        doc.text(value, x0 + CW + pad, top + 2, {
          width: LW - CW - pad * 2,
          height: RH - 4,
          align: 'center',
          ellipsis: true,
          lineBreak: false
        });
      }
    }
  });

  doc.restore();
}

async function generateSampleLabelsPdf(res, ids, filenameHint) {
  const tests = getSampleTests(ids);
  if (!tests.length) throw new Error('Không tìm thấy hồ sơ test đốt nào để in tem');

  const labels = tests.map(sampleToLabel);
  const doc = new PDFDocument({ size: [A5_LANDSCAPE.width, A5_LANDSCAPE.height], margin: 0, autoFirstPage: false, compress: true });
  doc.registerFont('LabelNormal', FONT_NORMAL);
  doc.registerFont('LabelBold', FONT_BOLD);

  const safe = safeFilePart(filenameHint || 'InTem_TestDot');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}.pdf`)}`);
  doc.pipe(res);

  const PAGE_W = A5_LANDSCAPE.width, PAGE_H = A5_LANDSCAPE.height;
  const { labelWidth: LW, labelHeight: LH, gapX: GX, gapY: GY, cols, perPage } = LAYOUT;
  const marginLeft = (PAGE_W - (cols * LW + (cols - 1) * GX)) / 2;
  const marginTop = (PAGE_H - (3 * LH + 2 * GY)) / 2;

  for (let page = 0; page < labels.length; page += perPage) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    const chunk = labels.slice(page, page + perPage);
    for (let i = 0; i < perPage; i++) {
      const item = (i < chunk.length) ? chunk[i] : null;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginLeft + col * (LW + GX);
      const y = marginTop + row * (LH + GY);
      drawLabel(doc, item, x, y);
    }
  }
  doc.end();
}

module.exports = { generateSampleLabelsPdf };
