const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const { prepare, UPLOADS_DIR } = require('../database/database');

const PHOTO_WIDTH = 260;
const PHOTO_HEIGHT = 180;
const PHOTO_ROW_HEIGHT = 145;

function getData(id) {
  const record = prepare(`SELECT r.id, r.purchase_order_id, r.customer_code, po.po_number
    FROM customer_check_records r
    JOIN purchase_orders po ON po.id = r.purchase_order_id
    WHERE r.id = ?`).get(id);
  if (!record) throw new Error('Không tìm thấy mã khách hàng');
  record.photos = prepare(`SELECT id, burn_hours, file_name, file_url, original_name, created_at
    FROM customer_check_photos WHERE record_id = ? ORDER BY burn_hours, id`).all(id);
  return record;
}

function resolvePhotoPath(photo) {
  const relative = String(photo.file_name || '').replace(/^\/+/, '').replace(/^uploads[\\/]/i, '');
  const candidates = [
    path.join(UPLOADS_DIR, ...relative.split(/[\\/]/)),
    photo.file_url ? path.join(UPLOADS_DIR, ...String(photo.file_url).replace(/^\/+/, '').replace(/^uploads[\\/]/i, '').split(/[\\/]/)) : ''
  ].filter(Boolean);
  return candidates.find(file => fs.existsSync(file)) || null;
}

async function loadPhoto(photo) {
  const source = resolvePhotoPath(photo);
  if (!source) return null;
  try {
    const raw = fs.readFileSync(source);
    const metadata = await sharp(raw).metadata();
    const width = Math.max(1, Number(metadata.width) || 1);
    const height = Math.max(1, Number(metadata.height) || 1);
    const buffer = await sharp(raw)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const extension = 'jpeg';
    const scale = Math.min(PHOTO_WIDTH / width, PHOTO_HEIGHT / height, 1);
    return { buffer, extension, width: Math.max(40, Math.round(width * scale)), height: Math.max(40, Math.round(height * scale)) };
  } catch (_) {
    return null;
  }
}

function border(color = 'FFD5DADF') {
  const side = { style: 'thin', color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

async function buildCustomerCheckReportXlsx(id) {
  const data = getData(id);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Burn Test QC';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Ảnh khách kiểm', { views: [{ showGridLines: false }] });

  sheet.columns = [
    { header: 'TIME', key: 'time', width: 12 },
    { header: 'ẢNH', key: 'photo1', width: 38 },
    { header: 'ẢNH', key: 'photo2', width: 38 },
    { header: 'ẢNH', key: 'photo3', width: 38 }
  ];

  sheet.mergeCells('A1:D1');
  const title = sheet.getCell('A1');
  title.value = 'BÁO CÁO ẢNH KHÁCH KIỂM';
  title.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF173A56' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells('A2:D2');
  const summary = sheet.getCell('A2');
  summary.value = `Đơn hàng: ${data.po_number || ''}    |    Mã: ${data.customer_code || ''}`;
  summary.font = { name: 'Arial', size: 11, bold: true };
  summary.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 24;

  const header = sheet.getRow(4);
  header.values = ['TIME', 'ẢNH', 'ẢNH', 'ẢNH'];
  header.height = 26;
  header.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A56' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border('FF173A56');
  });

  const groups = new Map();
  [...data.photos]
    .sort((a, b) => Number(a.burn_hours) - Number(b.burn_hours) || Number(a.id) - Number(b.id))
    .forEach(photo => {
      const hours = Number(photo.burn_hours);
      if (!groups.has(hours)) groups.set(hours, []);
      groups.get(hours).push(photo);
    });

  if (!groups.size) groups.set(0, []);
  for (const [hours, photos] of groups) {
    const row = sheet.addRow([hours === 0 ? 'Start' : `${hours}H`, '', '', '']);
    row.height = PHOTO_ROW_HEIGHT;
    row.eachCell(cell => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border();
    });

    for (let index = 0; index < Math.min(photos.length, 3); index++) {
      const info = await loadPhoto(photos[index]);
      if (!info) {
        row.getCell(index + 2).value = 'Không tìm thấy file ảnh';
        continue;
      }
      const imageId = workbook.addImage({ buffer: info.buffer, extension: info.extension });
      const cellWidth = 38 * 7 + 5;
      const cellHeight = PHOTO_ROW_HEIGHT * 4 / 3;
      sheet.addImage(imageId, {
        tl: {
          col: index + 1 + Math.max(0, (cellWidth - info.width) / cellWidth) / 2,
          row: row.number - 1 + Math.max(0, (cellHeight - info.height) / cellHeight) / 2
        },
        ext: { width: info.width, height: info.height },
        editAs: 'oneCell'
      });
    }
  }

  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildCustomerCheckReportXlsx };
