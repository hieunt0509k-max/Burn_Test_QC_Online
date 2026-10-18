// lib/sampleReportXlsx.js
// Xuất báo cáo Test hàng mẫu ra Excel (.xlsx)
// Layout: header 3 ô + các hàng ảnh (3 ảnh/hàng)
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const { prepare, UPLOADS_DIR } = require('../database/database');

const PHOTO_MAX_W = 300;
const PHOTO_MAX_H = 200;
const COL_WIDTH = 46;      // ~322px
const ROW_HEIGHT = 160;    // ~213px

function getData(id) {
  const r = prepare(`SELECT s.*, c.name customer_name, po.po_number
    FROM sample_burn_tests s
    LEFT JOIN customers c ON c.id=s.customer_id
    LEFT JOIN purchase_orders po ON po.id=s.purchase_order_id
    WHERE s.id=?`).get(id);
  if (!r) throw new Error('Không tìm thấy test hàng mẫu');
  r.photos = prepare('SELECT * FROM sample_burn_test_photos WHERE sample_test_id=? ORDER BY slot').all(id);
  return r;
}

function resolvePhotoPath(ph){
  const candidates=[
    path.join(UPLOADS_DIR,'sample-tests',String(ph.file_name||'')),
    path.resolve(String(ph.file_name||'')),
    ph.file_url ? path.join(UPLOADS_DIR,String(ph.file_url).replace(/^\/+/, '').replace(/^uploads[\\\/]/, '')) : ''
  ].filter(Boolean);
  return candidates.find(p=>fs.existsSync(p))||null;
}

async function loadPhotoForExcel(ph) {
  const src = resolvePhotoPath(ph);
  if (!src) return null;

  try {
    const raw = fs.readFileSync(src);
    const m = await sharp(raw).metadata();
    const pxW = Math.max(1, Number(m.width) || 1);
    const pxH = Math.max(1, Number(m.height) || 1);

    // Excel không hỗ trợ webp → convert PNG
    let ext = 'jpeg';
    let buf = raw;
    if (m.format === 'png') {
      ext = 'png';
    } else if (m.format === 'webp') {
      ext = 'png';
      buf = await sharp(raw).png().toBuffer();
    } else if (m.format !== 'jpeg' && m.format !== 'jpg') {
      ext = 'jpeg';
      buf = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
    }

    const scale = Math.min(PHOTO_MAX_W / pxW, PHOTO_MAX_H / pxH, 1);
    const w = Math.max(40, Math.round(pxW * scale));
    const h = Math.max(40, Math.round(pxH * scale));

    return { buffer: buf, ext, width: w, height: h };
  } catch (_) {
    return null;
  }
}

function thinBorder(argb) {
  const s = { style: 'thin', color: { argb } };
  return { top: s, left: s, bottom: s, right: s };
}

async function buildSampleReportXlsx(id) {
  const d = getData(id);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Burn Test QC';
  wb.created = new Date();

  const ws = wb.addWorksheet('Test hàng mẫu', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0, footer: 0 }
    },
    views: [{ showGridLines: false }]
  });

  ws.columns = [
    { width: COL_WIDTH },
    { width: COL_WIDTH },
    { width: COL_WIDTH }
  ];

  // ---------- HEADER ----------
  const headerRow = ws.addRow([]);
  headerRow.height = 28;

  const headers = [
    `Đơn hàng: ${d.po_number || ''}`,
    `Quy cách: ${d.product_name || d.size || ''}`,
    `Bấc: ${d.wick_spec || ''}`
  ];

  headers.forEach((txt, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = txt;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { name: 'Arial', size: 11, bold: true };
    cell.border = thinBorder('FFAEB7BF');
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FB' } };
  });

  // ---------- HÀNG ẢNH (khung) ----------
  const photos = (d.photos || []).sort((a, b) => Number(a.slot) - Number(b.slot));
  const totalPhotoRows = Math.max(1, Math.ceil(photos.length / 3));

  for (let r = 0; r < totalPhotoRows; r++) {
    const row = ws.addRow([]);
    row.height = ROW_HEIGHT;
    for (let c = 0; c < 3; c++) {
      const cell = row.getCell(c + 1);
      cell.border = thinBorder('FFD5DADF');
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // ---------- CHÈN ẢNH ----------
  const cellW = COL_WIDTH * 7 + 5;
  const cellH = ROW_HEIGHT * 4 / 3;

  for (let i = 0; i < photos.length; i++) {
    const info = await loadPhotoForExcel(photos[i]);
    if (!info) continue;

    const rowIdx = Math.floor(i / 3);
    const colIdx = i % 3;
    const imgId = wb.addImage({ buffer: info.buffer, extension: info.ext });

    const offX = Math.max(0, (cellW - info.width) / 2);
    const offY = Math.max(0, (cellH - info.height) / 2);

    ws.addImage(imgId, {
      tl: {
        col: colIdx + offX / cellW,
        row: rowIdx + 1 + offY / cellH
      },
      ext: { width: info.width, height: info.height },
      editAs: 'oneCell'
    });
  }

  return await wb.xlsx.writeBuffer();
}

module.exports = { buildSampleReportXlsx };