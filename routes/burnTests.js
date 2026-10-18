const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { prepare, UPLOADS_DIR } = require('../database/database');
const { generateBurnTestReportPdf } = require('../lib/pdfReport');
const { generateBurnTestReportXlsx } = require('../lib/xlsxReport');
const { generateWeeklyReportPdf, generateWeeklyReportXlsx } = require('../lib/weeklyReport');
const { generateBurnTestLabelsPdf } = require('../lib/burnTestLabelReport');
const { generateBurnTestLabelsXlsx } = require('../lib/burnTestLabelReportXlsx');

const router = express.Router();

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận JPG, PNG, WEBP hoặc GIF'));
    }
    cb(null, true);
  }
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!getVideoFormat(file)) {
      return cb(new Error('Chỉ chấp nhận video MP4, WEBM hoặc MOV'));
    }
    cb(null, true);
  }
});

const VIDEO_FORMATS_BY_MIME = {
  'video/mp4': { mimeType: 'video/mp4', extension: '.mp4' },
  'video/x-m4v': { mimeType: 'video/mp4', extension: '.mp4' },
  'video/webm': { mimeType: 'video/webm', extension: '.webm' },
  'video/quicktime': { mimeType: 'video/quicktime', extension: '.mov' }
};
const VIDEO_FORMATS_BY_EXTENSION = {
  '.mp4': VIDEO_FORMATS_BY_MIME['video/mp4'],
  '.m4v': VIDEO_FORMATS_BY_MIME['video/mp4'],
  '.webm': VIDEO_FORMATS_BY_MIME['video/webm'],
  '.mov': VIDEO_FORMATS_BY_MIME['video/quicktime']
};

function getVideoFormat(file) {
  const mimeType = String(file.mimetype || '').split(';', 1)[0].trim().toLowerCase();
  if (VIDEO_FORMATS_BY_MIME[mimeType]) return VIDEO_FORMATS_BY_MIME[mimeType];
  if (!mimeType || ['application/octet-stream', 'text/plain'].includes(mimeType)) {
    return VIDEO_FORMATS_BY_EXTENSION[path.extname(file.originalname || '').toLowerCase()] || null;
  }
  return null;
}

function handleVideoUpload(req, res, next) {
  videoUpload.single('file')(req, res, err => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Video vượt quá giới hạn 150 MB' : err.message });
  });
}

function normalizeResult(value) {
  if (value === '' || value === null || value === undefined) return 'PENDING';
  const result = String(value).toUpperCase();
  if (!['PASS', 'FAIL', 'PENDING'].includes(result)) throw new Error('result chỉ nhận PASS, FAIL hoặc PENDING');
  return result;
}

const MATERIAL_TYPES = ['glass_ceramic', 'tin_iron', 'plastic'];
function normalizeMaterialTypes(value) {
  if (value === undefined || value === null || value === '') return null;
  const values = (Array.isArray(value) ? value : String(value).split(','))
    .map(x => String(x).trim()).filter(x => MATERIAL_TYPES.includes(x));
  return [...new Set(values)].join(',') || null;
}

function validatePayload(body, partial = false) {
  const payload = {
    purchase_order_id: Number(body.purchase_order_id ?? body.po_id),
    product_code: String(body.product_code ?? '').trim(),
    diameter_mm: body.diameter_mm ?? body.diameter ?? null,
    height_mm: body.height_mm ?? body.height ?? null,
    fragrance: body.fragrance ?? body.frag ?? null,
    color: body.color ?? null,
    wick: body.wick ?? null,
    material_types: body.material_types === undefined ? (partial ? undefined : null) : normalizeMaterialTypes(body.material_types),
    temperature_c: body.temperature_c ?? body.temperature ?? null,
    test_date: body.test_date ?? null,
    test_time: body.test_time ?? body.time ?? null,
    start_datetime: body.start_datetime ?? body.start ?? null,
    end_datetime: body.end_datetime ?? body.end ?? null,
    total_burn_time: body.total_burn_time ?? body.totalBurnTime ?? null,
    tester: body.tester ?? null,
    approver: body.approver ?? body.approved ?? null,
    result: normalizeResult(body.result ?? body.test_result),
    note: body.note ?? null
  };

  if (!partial && (!payload.purchase_order_id || !payload.product_code || !payload.test_date)) {
    throw new Error('purchase_order_id, product_code và test_date là bắt buộc');
  }
  for (const [name, value] of [['diameter_mm', payload.diameter_mm], ['height_mm', payload.height_mm], ['temperature_c', payload.temperature_c]]) {
    if (value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      throw new Error(`${name} phải là số lớn hơn 0`);
    }
  }
  return payload;
}

function withLegacyFields(test, photos = []) {
  if (!test) return test;
  const row = { ...test, photos };
  row.Id = row.id;
  row.PO_Id = row.purchase_order_id;
  row.Product_Code = row.product_code;
  row.Diameter = row.diameter_mm;
  row.Height = row.height_mm;
  row.Frag = row.fragrance;
  row.Color = row.color;
  row.Wick = row.wick;
  row.Material_Types = row.material_types ? row.material_types.split(',') : [];
  row.Temperature = row.temperature_c;
  row.Test_date = row.test_date;
  row.Time = row.test_time;
  row.Start = row.start_datetime;
  row.End = row.end_datetime;
  row.Total_Burn_Time = row.total_burn_time;
  row.Tester = row.tester;
  row.Approved = row.approver;
  row.Test_result = row.result === 'PENDING' ? null : row.result;
  for (const photo of photos) row[`PIC_${photo.slot}`] = photo.file_url;
  return row;
}

// ---------- Đọc/ghi file Burn Test trên đĩa cục bộ ----------
// file_name lưu trong DB luôn dùng dấu "/" (kiểu URL) bất kể hệ điều hành,
// chỉ convert sang path.join (đúng dấu \ trên Windows) khi thao tác với ổ đĩa thật.
function relToDiskPath(relPath) {
  return path.join(UPLOADS_DIR, ...relPath.split('/'));
}
function writeUploadFile(relPath, buffer) {
  const diskPath = relToDiskPath(relPath);
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  fs.writeFileSync(diskPath, buffer);
}
function deletePhotoFile(relPath) {
  if (!relPath) return;
  try { fs.unlinkSync(relToDiskPath(relPath)); }
  catch (e) { if (e.code !== 'ENOENT') console.warn('Không xóa được file ảnh:', e.message); }
}

function deleteVideoFile(relPath) {
  if (!relPath) return;
  try { fs.unlinkSync(relToDiskPath(relPath)); }
  catch (e) { if (e.code !== 'ENOENT') console.warn('Không xóa được file video:', e.message); }
}

function fetchPhotos(testId) {
  const rows = prepare(`SELECT id, slot, file_name, file_url, original_name, mime_type, file_size, created_at
    FROM burn_test_photos WHERE burn_test_id = ? ORDER BY slot`).all(testId);
  return rows.map(r => ({ ...r, file_path: relToDiskPath(r.file_name) }));
}

function fetchVideos(testId) {
  return prepare(`SELECT id, burn_test_id, file_url, original_name, mime_type, file_size, duration_seconds, created_at
    FROM burn_test_videos WHERE burn_test_id = ? ORDER BY created_at DESC, id DESC`).all(testId);
}

function fetchLogs(testId) {
  return prepare(`SELECT id, burn_test_id, time_label, wick_status, flame_status, wick_height_mm,
    vessel_condition, temperature_c, note, created_at
    FROM burn_test_logs WHERE burn_test_id = ? ORDER BY created_at, id`).all(testId);
}

function getTest(id) {
  const data = prepare(`
    SELECT bt.*, po.po_number AS po_number, c.name AS customer_name
    FROM burn_tests bt
    JOIN purchase_orders po ON po.id = bt.purchase_order_id
    JOIN customers c ON c.id = po.customer_id
    WHERE bt.id = ?
  `).get(id);
  if (!data) return null;
  const photos = fetchPhotos(id);
  const videos = fetchVideos(id);
  const logs = fetchLogs(id);
  const row = withLegacyFields(data, photos);
  row.videos = videos;
  row.logs = logs;
  return row;
}

function listTests(query) {
  let sql = `
    SELECT bt.*, po.po_number AS po_number, c.name AS customer_name,
      (SELECT p.image_url FROM products p
        WHERE p.order_id = bt.purchase_order_id AND lower(p.product_code) = lower(bt.product_code)
        ORDER BY p.id DESC LIMIT 1) AS product_image_url
    FROM burn_tests bt
    JOIN purchase_orders po ON po.id = bt.purchase_order_id
    JOIN customers c ON c.id = po.customer_id
    WHERE 1=1
  `;
  const params = [];
  const po = query.purchase_order_id || query.po_id;
  const r = query.result || query.test_result;
  if (po) { sql += ' AND bt.purchase_order_id = ?'; params.push(po); }
  if (query.product_code) { sql += ' AND bt.product_code LIKE ?'; params.push(`%${query.product_code}%`); }
  if (r) { sql += ' AND bt.result = ?'; params.push(r === 'CHỜ' ? 'PENDING' : r); }
  if (query.tester) { sql += ' AND bt.tester LIKE ?'; params.push(`%${query.tester}%`); }
  if (query.from_date) { sql += ' AND bt.test_date >= ?'; params.push(query.from_date); }
  if (query.to_date) { sql += ' AND bt.test_date <= ?'; params.push(query.to_date); }
  sql += ' ORDER BY bt.test_date DESC, bt.id DESC';

  const data = prepare(sql).all(...params);
  const ids = data.map(x => x.id);
  let photos = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    photos = prepare(`SELECT id, burn_test_id, slot, file_url, original_name, mime_type, file_size, created_at
      FROM burn_test_photos WHERE burn_test_id IN (${placeholders}) ORDER BY slot`).all(...ids);
  }
  const byTest = {};
  for (const p of photos) (byTest[p.burn_test_id] ||= []).push(p);

  return data.map(t => {
    const row = withLegacyFields(t, byTest[t.id] || []);
    row.photo_count = (byTest[t.id] || []).length;
    for (const p of (byTest[t.id] || [])) row[`PIC_${p.slot}`] = p.file_url;
    return row;
  });
}

router.get('/', (req, res, next) => {
  try { res.json(listTests(req.query)); } catch (err) { next(err); }
});


// Xuất toàn bộ danh sách Burn Test theo đúng bộ lọc hiện tại (không phụ thuộc phân trang UI).
router.get('/export.xlsx', async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { getBrand } = require('../lib/reportBrand');
    let sql = `SELECT bt.*, po.po_number AS po_number, c.name AS customer_name
      FROM burn_tests bt
      JOIN purchase_orders po ON po.id = bt.purchase_order_id
      JOIN customers c ON c.id = po.customer_id WHERE 1=1`;
    const params = [];
    const po = req.query.purchase_order_id || req.query.po_id;
    const result = req.query.result || req.query.test_result;
    const customer = req.query.customer_id || req.query.cus_id;
    if (customer) { sql += ' AND c.id = ?'; params.push(Number(customer)); }
    if (po) { sql += ' AND bt.purchase_order_id = ?'; params.push(Number(po)); }
    if (req.query.product_code) { sql += ' AND bt.product_code LIKE ?'; params.push(`%${req.query.product_code}%`); }
    if (result) { sql += ' AND bt.result = ?'; params.push(String(result).toUpperCase() === 'CHỜ' ? 'PENDING' : String(result).toUpperCase()); }
    if (req.query.tester) { sql += ' AND bt.tester LIKE ?'; params.push(`%${req.query.tester}%`); }
    if (req.query.from_date) { sql += ' AND bt.test_date >= ?'; params.push(req.query.from_date); }
    if (req.query.to_date) { sql += ' AND bt.test_date <= ?'; params.push(req.query.to_date); }
    sql += ' ORDER BY bt.test_date DESC, bt.id DESC';
    let rows = prepare(sql).all(...params);
    const search = normalizeSearchText(req.query.search).trim();
    if (search) {
      rows = rows.filter(row => normalizeSearchText(Object.values(row).join(' ')).includes(search));
    }

    const brand = getBrand();
    const wb = new ExcelJS.Workbook();
    wb.creator = brand.company || 'Burn Test QC';
    wb.created = new Date();
    const ws = wb.addWorksheet('Burn Test');
    ws.views = [{ state: 'frozen', ySplit: 5 }];
    ws.columns = [
      {header:'STT', key:'stt', width:7}, {header:'Ngày test', key:'test_date', width:13},
      {header:'Khách hàng', key:'customer', width:24}, {header:'PO', key:'po', width:18},
      {header:'Mã SP', key:'product', width:22}, {header:'Ø (mm)', key:'diameter', width:11},
      {header:'Cao (mm)', key:'height', width:11}, {header:'Bấc', key:'wick', width:16},
      {header:'Màu', key:'color', width:16}, {header:'Hương', key:'fragrance', width:22},
      {header:'Nhiệt độ (°C)', key:'temp', width:15}, {header:'Bắt đầu', key:'start', width:20},
      {header:'Kết thúc', key:'end', width:20}, {header:'Tổng thời gian đốt', key:'burn_time', width:20},
      {header:'Người test', key:'tester', width:18}, {header:'Người duyệt', key:'approver', width:18},
      {header:'Kết quả', key:'result', width:15}, {header:'Ghi chú', key:'note', width:35}
    ];
    ws.mergeCells('A1:R1'); ws.getCell('A1').value = brand.title || 'BÁO CÁO DANH SÁCH TEST ĐỐT';
    ws.getCell('A1').font = {bold:true, size:16}; ws.getCell('A1').alignment={horizontal:'center'};
    ws.mergeCells('A2:R2'); ws.getCell('A2').value = [brand.company, brand.factory, brand.address].filter(Boolean).join(' — ');
    ws.getCell('A2').font={bold:true,size:10}; ws.getCell('A2').alignment={horizontal:'center'};
    ws.mergeCells('A3:R3'); ws.getCell('A3').value = `Xuất lúc: ${new Date().toLocaleString('vi-VN',{hour12:false})}`;
    ws.getCell('A3').font={italic:true,size:9}; ws.getCell('A3').alignment={horizontal:'center'};
    ws.mergeCells('A4:R4');
    const filterText = [customer&&`Khách hàng #${customer}`,po&&`PO #${po}`,req.query.product_code&&`Mã SP: ${req.query.product_code}`,result&&`Kết quả: ${result}`,req.query.from_date&&`Từ: ${req.query.from_date}`,req.query.to_date&&`Đến: ${req.query.to_date}`].filter(Boolean).join(' | ');
    ws.getCell('A4').value = `Bộ lọc: ${filterText || 'Tất cả'}`; ws.getCell('A4').font={size:9};
    const header = ws.getRow(5);
    // ExcelJS Row is not directly iterable in some versions. Build the header row explicitly.
    ws.columns.forEach((col, index) => { header.getCell(index + 1).value = col.header; });
    header.font={bold:true};
    header.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    header.height=28;
    for (let i = 1; i <= ws.columnCount; i++) {
      header.getCell(i).border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
    }
    const fmt = v => v === null || v === undefined || v === '' ? '—' : v;
    rows.forEach((r,i)=>{
      const row=ws.addRow({stt:i+1,test_date:fmt(r.test_date),customer:fmt(r.customer_name),po:fmt(r.po_number),product:fmt(r.product_code),diameter:fmt(r.diameter_mm),height:fmt(r.height_mm),wick:fmt(r.wick),color:fmt(r.color),fragrance:fmt(r.fragrance),temp:fmt(r.temperature_c),start:fmt(r.start_datetime),end:fmt(r.end_datetime),burn_time:fmt(r.total_burn_time),tester:fmt(r.tester),approver:fmt(r.approver),result:fmt(r.result),note:fmt(r.note)});
      row.eachCell({includeEmpty:true}, cell => { cell.border={bottom:{style:'hair',color:{argb:'FFD8CFC2'}}}; });
      row.getCell(17).font={bold:true};
    });
    ws.autoFilter = {from:'A5',to:'R5'};
    ws.eachRow((row, idx)=>{ if(idx>=6) row.alignment={vertical:'middle',wrapText:true}; });
    const fileName = `burn-test-danh-sach-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { next(err); }
});

router.get('/summary', (req, res, next) => {
  try {
    let sql = 'SELECT result FROM burn_tests WHERE 1=1';
    const params = [];
    const po = req.query.purchase_order_id || req.query.po_id;
    if (po) { sql += ' AND purchase_order_id = ?'; params.push(po); }
    if (req.query.result) { sql += ' AND result = ?'; params.push(req.query.result); }
    const rows = prepare(sql).all(...params);
    res.json({
      total: rows.length,
      pass_count: rows.filter(x => x.result === 'PASS').length,
      fail_count: rows.filter(x => x.result === 'FAIL').length,
      pending_count: rows.filter(x => x.result === 'PENDING').length
    });
  } catch (err) { next(err); }
});


function validateDateRange(fromDate, toDate) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(fromDate || '')) || !re.test(String(toDate || ''))) throw new Error('from_date và to_date phải có dạng YYYY-MM-DD');
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error('Khoảng ngày không hợp lệ');
  const days = Math.round((to-from)/86400000)+1;
  if (days > 31) throw new Error('Khoảng báo cáo tối đa 31 ngày');
  return { fromDate, toDate };
}

function validateWeeklyFilters(query) {
  const filters = { customerId: null, result: null };
  const customerId = query.customer_id || query.cus_id;
  if (customerId !== undefined && customerId !== '') {
    const value = Number(customerId);
    if (!Number.isInteger(value) || value < 1) throw new Error('customer_id không hợp lệ');
    filters.customerId = value;
  }

  if (query.result !== undefined && query.result !== '') {
    const value = String(query.result).toUpperCase();
    if (!['PASS', 'FAIL', 'PENDING'].includes(value)) throw new Error('result phải là PASS, FAIL hoặc PENDING');
    filters.result = value;
  }
  return filters;
}

function buildWeeklyReport(fromDate, toDate, filters = {}) {
  let sql = `SELECT bt.test_date, bt.result FROM burn_tests bt
    JOIN purchase_orders po ON po.id = bt.purchase_order_id
    WHERE bt.test_date >= ? AND bt.test_date <= ?`;
  const params = [fromDate, toDate];
  if (filters.customerId) { sql += ' AND po.customer_id = ?'; params.push(filters.customerId); }
  if (filters.result) { sql += ' AND bt.result = ?'; params.push(filters.result); }
  sql += ' ORDER BY bt.test_date, bt.id';
  const rows = prepare(sql).all(...params);

  const daily = [];
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayRows = rows.filter(r => String(r.test_date || '').slice(0,10) === date);
    daily.push({
      date,
      total: dayRows.length,
      pass: dayRows.filter(r => r.result === 'PASS').length,
      fail: dayRows.filter(r => r.result === 'FAIL').length,
      pending: dayRows.filter(r => r.result === 'PENDING').length
    });
  }
  const total = rows.length;
  const pass_count = rows.filter(r => r.result === 'PASS').length;
  const fail_count = rows.filter(r => r.result === 'FAIL').length;
  const pending_count = rows.filter(r => r.result === 'PENDING').length;
  const pass_rate = total ? (pass_count / total) * 100 : 0;
  return {
    from_date: fromDate, to_date: toDate, total, pass_count, fail_count, pending_count, pass_rate, daily,
    filters: { customer_id: filters.customerId, result: filters.result }
  };
}

router.get('/weekly-summary', (req, res, next) => {
  try {
    const { fromDate, toDate } = validateDateRange(req.query.from_date, req.query.to_date);
    res.json(buildWeeklyReport(fromDate, toDate, validateWeeklyFilters(req.query)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/weekly-report.pdf', async (req, res, next) => {
  try {
    const { fromDate, toDate } = validateDateRange(req.query.from_date, req.query.to_date);
    const report = buildWeeklyReport(fromDate, toDate, validateWeeklyFilters(req.query));
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="bao-cao-tuan-${fromDate}-den-${toDate}.pdf"`);
    await generateWeeklyReportPdf(res, report);
  } catch (err) { next(err); }
});

router.get('/weekly-report.xlsx', async (req, res, next) => {
  try {
    const { fromDate, toDate } = validateDateRange(req.query.from_date, req.query.to_date);
    const report = buildWeeklyReport(fromDate, toDate, validateWeeklyFilters(req.query));
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="bao-cao-tuan-${fromDate}-den-${toDate}.xlsx"`);
    await generateWeeklyReportXlsx(res, report);
  } catch (err) { next(err); }
});


// ---------- Đánh giá PASS/FAIL theo QC Standards ----------
function normCriterion(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
function criterionField(criterion) {
  const c = normCriterion(criterion);
  if (/(^| )(diameter|duong kinh)( |$)/.test(c)) return { key:'diameter_mm', label:'Đường kính', unit:'mm' };
  if (/(surface temperature|surface temp|nhiet do be mat)/.test(c) || /nhiệt độ bề mặt/i.test(String(criterion))) return { key:'surface_temperature_c', label:'Nhiệt độ bề mặt', unit:'°C' };
  if (/(^| )(temperature|nhiet do)( |$)/.test(c)) return { key:'temperature_c', label:'Nhiệt độ', unit:'°C' };
  if (/(wick height|chieu cao bac|bac height|flame height|chieu cao ngon lua)/.test(c)) return { key:'wick_height_mm', label:'Chiều cao ngọn lửa', unit:'mm' };
  if (/(^| )(height|chieu cao)( |$)/.test(c)) return { key:'height_mm', label:'Chiều cao sản phẩm', unit:'mm' };
  if (/(melt pool|be mat tan|melt pool depth)/.test(c)) return { key:'melt_pool_mm', label:'Melt Pool', unit:'mm' };
  if (/(burn rate|toc do dot)/.test(c)) return { key:'burn_rate_g h', label:'Burn Rate', unit:'g/h' };
  return null;
}
function isSurfaceTemperatureCriterion(criterion) {
  return /surface temperature|surface temp|nhiet do be mat/.test(normCriterion(criterion)) || /nhiệt độ bề mặt/i.test(String(criterion));
}
function materialMatchesCriterion(material, criterion) {
  const c = normCriterion(criterion);
  const raw = String(criterion || '').toLowerCase();
  if (material === 'glass_ceramic') return /thuy tinh|gom/.test(c) || /thủy tinh|gốm/i.test(raw);
  if (material === 'tin_iron') return /thiec|sat|kim loai/.test(c) || /thiếc|sắt|kim loại/i.test(raw);
  if (material === 'plastic') return /nhua|plastic/.test(c) || /nhựa|plastic/i.test(raw);
  return false;
}
function numericValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function evaluateTest(testId) {
  const test = prepare('SELECT * FROM burn_tests WHERE id = ?').get(testId);
  if (!test) throw new Error('Không tìm thấy bản ghi test');
  const custRow = prepare('SELECT po.customer_id AS customer_id FROM burn_tests bt LEFT JOIN purchase_orders po ON po.id = bt.purchase_order_id WHERE bt.id = ?').get(testId);
  const customerId = custRow && custRow.customer_id != null ? Number(custRow.customer_id) : null;
  const standards = customerId
    ? prepare(`SELECT * FROM qc_standards WHERE active = 1 AND (customer_id IS NULL OR customer_id = ?) ORDER BY customer_id IS NULL, id`).all(customerId)
    : prepare(`SELECT * FROM qc_standards WHERE active = 1 AND customer_id IS NULL ORDER BY id`).all();
  const selectedMaterials = normalizeMaterialTypes(test.material_types)?.split(',') || [];
  const filteredStandards = selectedMaterials.length
    ? standards.filter(st => !isSurfaceTemperatureCriterion(st.criterion) || selectedMaterials.some(material => materialMatchesCriterion(material, st.criterion)))
    : standards;
  const logs = fetchLogs(testId);
  const results = [];
  let hasApplicable = false, hasMissing = false, hasFail = false;

  for (const st of filteredStandards) {
    const mapped = criterionField(st.criterion);
    if (!mapped) {
      results.push({id:st.id,name:st.name,criterion:st.criterion,status:'UNSUPPORTED',message:'Chưa có dữ liệu tương ứng trong mẫu Burn Test hiện tại'});
      continue;
    }
    let values = [];
    if (mapped.key === 'wick_height_mm') values = logs.map(x=>numericValue(x.wick_height_mm)).filter(x=>x!==null);
    else if (mapped.key === 'surface_temperature_c') values = logs.map(x=>numericValue(x.temperature_c)).filter(x=>x!==null);
    else if (mapped.key === 'melt_pool_mm') values = logs.map(x=>numericValue(x.melt_pool_mm)).filter(x=>x!==null);
    else if (mapped.key === 'burn_rate_g h') values = logs.map(x=>numericValue(x.burn_rate_g_h)).filter(x=>x!==null);
    else { const v=numericValue(test[mapped.key]); if(v!==null) values=[v]; }

    const min = numericValue(st.min_value), max = numericValue(st.max_value);
    if (min===null && max===null) {
      results.push({id:st.id,name:st.name,criterion:st.criterion,status:'NO_LIMIT',message:'Tiêu chuẩn chưa khai báo Min/Max'});
      continue;
    }
    hasApplicable = true;
    if (!values.length) {
      hasMissing = true;
      results.push({id:st.id,name:st.name,criterion:st.criterion,status:'PENDING',message:`Thiếu dữ liệu ${mapped.label}`,min,max,unit:st.unit||mapped.unit});
      continue;
    }
    const checks = values.map(v => ({value:v, pass:(min===null||v>=min)&&(max===null||v<=max)}));
    const pass = checks.every(x=>x.pass);
    if (!pass) hasFail = true;
    results.push({id:st.id,name:st.name,criterion:st.criterion,status:pass?'PASS':'FAIL',values:checks.map(x=>x.value),min,max,unit:st.unit||mapped.unit,message:pass?'Đạt giới hạn':'Có giá trị vượt giới hạn'});
  }
  const status = !hasApplicable ? 'PENDING' : hasFail ? 'FAIL' : hasMissing ? 'PENDING' : 'PASS';
  return {test_id:Number(testId), status, standards_count:standards.length, applicable_count:results.filter(x=>['PASS','FAIL','PENDING'].includes(x.status)).length, results};
}

router.get('/:id/evaluation', (req,res,next)=>{
  try { res.json(evaluateTest(req.params.id)); } catch(e) { next(e); }
});

router.post('/:id/evaluate', (req,res,next)=>{
  try {
    const evaluation=evaluateTest(req.params.id);
    if (evaluation.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', req.params.id);
    res.json({ ...evaluation, result:evaluation.status, test:getTest(req.params.id) });
  } catch(e) { res.status(400).json({error:e.message}); }
});

// In tem cho nhiều bản ghi test đốt đã chọn (PDF / XLSX)
router.post('/labels.pdf', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await generateBurnTestLabelsPdf(res, ids, 'InTem_TestDot');
  } catch (err) { next(err); }
});

router.post('/labels.xlsx', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await generateBurnTestLabelsXlsx(res, ids, 'Tem_TestDot');
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = getTest(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });
    res.json(row);
  } catch (err) { next(err); }
});

router.get('/:id/report.pdf', async (req, res, next) => {
  try {
    const test = getTest(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });

    const safeCode = String(test.Product_Code || test.Id).replace(/[^a-zA-Z0-9._-]+/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-test-dot-${safeCode}.pdf"`);
    await generateBurnTestReportPdf(res, test);
  } catch (err) { next(err); }
});

router.get('/:id/report.xlsx', async (req, res, next) => {
  try {
    const test = getTest(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });

    const safeCode = String(test.Product_Code || test.Id).replace(/[^a-zA-Z0-9._-]+/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-test-dot-${safeCode}.xlsx"`);
    await generateBurnTestReportXlsx(res, test);
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const p = validatePayload(req.body);
    const po = prepare('SELECT id FROM purchase_orders WHERE id = ?').get(p.purchase_order_id);
    if (!po) return res.status(400).json({ error: 'PO không tồn tại' });

    const r = prepare(`INSERT INTO burn_tests
      (purchase_order_id, product_code, diameter_mm, height_mm, fragrance, color, wick, material_types, temperature_c,
       test_date, test_time, start_datetime, end_datetime, total_burn_time, tester, approver, result, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      p.purchase_order_id, p.product_code,
      p.diameter_mm === '' ? null : p.diameter_mm,
      p.height_mm === '' ? null : p.height_mm,
      p.fragrance, p.color, p.wick, p.material_types,
      p.temperature_c === '' ? null : p.temperature_c,
      p.test_date, p.test_time, p.start_datetime, p.end_datetime,
      p.total_burn_time, p.tester, p.approver, p.result, p.note
    );
    let evaluation = null;
    try { evaluation = evaluateTest(r.lastInsertRowid); if (evaluation.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', r.lastInsertRowid); } catch (_) {}
    res.status(201).json({ ...getTest(r.lastInsertRowid), evaluation });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

function sanitizeProductCode(code) {
  // Dùng làm tên thư mục trên đĩa -> loại bỏ ký tự không an toàn (/, khoảng trắng, v.v).
  let safe = String(code ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (safe === '.' || safe === '..') safe = safe.replace(/\./g, '_');
  if (!safe) throw new Error('Giá trị không hợp lệ để tạo đường dẫn lưu file');
  return safe;
}

function buildTestUploadDirectory(poNumber, productCode, testDate) {
  const dateFolder = String(testDate || 'undated').trim().replace(/[^0-9-]/g, '_') || 'undated';
  return `${sanitizeProductCode(poNumber)}/${sanitizeProductCode(productCode)}/${dateFolder}`;
}

function buildPhotoPath(testId, poNumber, productCode, testDate, slot, ext) {
  return `${buildTestUploadDirectory(poNumber, productCode, testDate)}/burn-test-${testId}-${slot}${ext}`;
}

// Khi đổi PO, mã hàng hoặc ngày test, di chuyển ảnh sang đúng thư mục nhận diện test.
function movePhotosOnIdentityChange(testId, oldPoNumber, oldProductCode, oldTestDate, newPoNumber, newProductCode, newTestDate) {
  const oldSafe = sanitizeProductCode(oldPoNumber);
  const newSafe = sanitizeProductCode(newPoNumber);
  const oldCodeSafe = sanitizeProductCode(oldProductCode);
  const newCodeSafe = sanitizeProductCode(newProductCode);
  const oldDateSafe = sanitizeProductCode(oldTestDate || 'undated');
  const newDateSafe = sanitizeProductCode(newTestDate || 'undated');
  if (oldSafe === newSafe && oldCodeSafe === newCodeSafe && oldDateSafe === newDateSafe) return { moved: 0, failed: 0 };

  const photos = prepare('SELECT id, slot, file_name FROM burn_test_photos WHERE burn_test_id = ?').all(testId);
  if (!photos.length) return { moved: 0, failed: 0 };

  let moved = 0, failed = 0;
  for (const photo of photos) {
    try {
      const ext = (path.extname(photo.file_name) || '.jpg').toLowerCase();
      const newRelPath = buildPhotoPath(testId, newPoNumber, newProductCode, newTestDate, photo.slot, ext);
      if (newRelPath === photo.file_name) continue;

      const oldDiskPath = relToDiskPath(photo.file_name);
      const newDiskPath = relToDiskPath(newRelPath);
      fs.mkdirSync(path.dirname(newDiskPath), { recursive: true });
      fs.copyFileSync(oldDiskPath, newDiskPath);

      const newUrl = `/uploads/${newRelPath}`;
      prepare('UPDATE burn_test_photos SET file_name = ?, file_url = ? WHERE id = ?').run(newRelPath, newUrl, photo.id);

      const otherReferences = prepare('SELECT COUNT(*) AS count FROM burn_test_photos WHERE file_name = ? AND id <> ?').get(photo.file_name, photo.id)?.count || 0;
      if (!otherReferences) fs.unlinkSync(oldDiskPath);
      moved++;
    } catch (err) {
      failed++;
      console.warn(`⚠ Không di chuyển được ảnh #${photo.id} (test ${testId}):`, err.message);
    }
  }
  return { moved, failed };
}

function moveVideosOnIdentityChange(testId, oldPoNumber, oldProductCode, oldTestDate, newPoNumber, newProductCode, newTestDate) {
  const oldDirectory = buildTestUploadDirectory(oldPoNumber, oldProductCode, oldTestDate);
  const newDirectory = buildTestUploadDirectory(newPoNumber, newProductCode, newTestDate);
  if (oldDirectory === newDirectory) return { moved: 0, failed: 0 };

  const videos = prepare('SELECT id, file_name FROM burn_test_videos WHERE burn_test_id = ?').all(testId);
  if (!videos.length) return { moved: 0, failed: 0 };

  let moved = 0, failed = 0;
  for (const video of videos) {
    try {
      const newRelPath = `${newDirectory}/${path.basename(video.file_name)}`;
      if (newRelPath === video.file_name) continue;

      const oldDiskPath = relToDiskPath(video.file_name);
      const newDiskPath = relToDiskPath(newRelPath);
      fs.mkdirSync(path.dirname(newDiskPath), { recursive: true });
      fs.copyFileSync(oldDiskPath, newDiskPath);

      prepare('UPDATE burn_test_videos SET file_name = ?, file_url = ? WHERE id = ?')
        .run(newRelPath, `/uploads/${newRelPath}`, video.id);

      const otherReferences = prepare('SELECT COUNT(*) AS count FROM burn_test_videos WHERE file_name = ? AND id <> ?')
        .get(video.file_name, video.id)?.count || 0;
      if (!otherReferences) fs.unlinkSync(oldDiskPath);
      moved++;
    } catch (err) {
      failed++;
      console.warn(`⚠ Không di chuyển được video #${video.id} (test ${testId}):`, err.message);
    }
  }
  return { moved, failed };
}

router.put('/:id', (req, res, next) => {
  try {
    const existing = prepare('SELECT * FROM burn_tests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });

    // Ghép dữ liệu tường minh từng trường — KHÔNG dùng {...existing, ...req.body} vì tên field
    // frontend gửi lên (VD: test_result, diameter, approved) khác tên cột thật trong DB
    // (VD: result, diameter_mm, approver). Spread kiểu cũ khiến giá trị cũ trong DB "che mất"
    // giá trị mới gửi lên do 2 field trùng nghĩa nhưng khác tên không hề ghi đè lẫn nhau.
    const p = validatePayload({
      purchase_order_id: req.body.purchase_order_id ?? req.body.po_id ?? existing.purchase_order_id,
      product_code: req.body.product_code ?? existing.product_code,
      diameter_mm: req.body.diameter_mm ?? req.body.diameter ?? existing.diameter_mm,
      height_mm: req.body.height_mm ?? req.body.height ?? existing.height_mm,
      fragrance: req.body.fragrance ?? req.body.frag ?? existing.fragrance,
      color: req.body.color ?? existing.color,
      wick: req.body.wick ?? existing.wick,
      material_types: req.body.material_types ?? existing.material_types,
      temperature_c: req.body.temperature_c ?? req.body.temperature ?? existing.temperature_c,
      test_date: req.body.test_date ?? existing.test_date,
      test_time: req.body.test_time ?? req.body.time ?? existing.test_time,
      start_datetime: req.body.start_datetime ?? req.body.start ?? existing.start_datetime,
      end_datetime: req.body.end_datetime ?? req.body.end ?? existing.end_datetime,
      total_burn_time: req.body.total_burn_time ?? req.body.totalBurnTime ?? existing.total_burn_time,
      tester: req.body.tester ?? existing.tester,
      approver: req.body.approver ?? req.body.approved ?? existing.approver,
      result: req.body.result ?? req.body.test_result ?? existing.result,
      note: req.body.note ?? existing.note
    }, true);

    const po = prepare('SELECT id, po_number FROM purchase_orders WHERE id = ?').get(p.purchase_order_id);
    if (!po) return res.status(400).json({ error: 'PO không tồn tại' });

    prepare(`UPDATE burn_tests SET
      purchase_order_id=?, product_code=?, diameter_mm=?, height_mm=?, fragrance=?, color=?, wick=?, material_types=?,
      temperature_c=?, test_date=?, test_time=?, start_datetime=?, end_datetime=?, total_burn_time=?,
      tester=?, approver=?, result=?, note=?, updated_at=datetime('now')
      WHERE id=?`).run(
      p.purchase_order_id, p.product_code,
      p.diameter_mm === '' ? null : p.diameter_mm,
      p.height_mm === '' ? null : p.height_mm,
      p.fragrance, p.color, p.wick,
      p.material_types, p.temperature_c === '' ? null : p.temperature_c,
      p.test_date, p.test_time, p.start_datetime, p.end_datetime,
      p.total_burn_time, p.tester, p.approver, p.result, p.note,
      req.params.id
    );

    let evaluation = null;
    try { evaluation = evaluateTest(req.params.id); if (evaluation.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', req.params.id); } catch (_) {}

    // PO, mã hàng hoặc ngày test đổi -> di chuyển ảnh sang đường dẫn mới.
    try {
      let oldPoNumber = po.po_number;
      if (String(existing.purchase_order_id) !== String(p.purchase_order_id)) {
        const oldPo = prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(existing.purchase_order_id);
        oldPoNumber = oldPo?.po_number ?? String(existing.purchase_order_id);
      }
      movePhotosOnIdentityChange(req.params.id, oldPoNumber, existing.product_code, existing.test_date, po.po_number, p.product_code, p.test_date);
    } catch (moveErr) {
      console.warn(`⚠ Lỗi di chuyển ảnh cho test ${req.params.id}:`, moveErr.message);
    }
    try {
      let oldPoNumber = po.po_number;
      if (String(existing.purchase_order_id) !== String(p.purchase_order_id)) {
        const oldPo = prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(existing.purchase_order_id);
        oldPoNumber = oldPo?.po_number ?? String(existing.purchase_order_id);
      }
      moveVideosOnIdentityChange(req.params.id, oldPoNumber, existing.product_code, existing.test_date, po.po_number, p.product_code, p.test_date);
    } catch (moveErr) {
      console.warn(`⚠ Lỗi di chuyển video cho test ${req.params.id}:`, moveErr.message);
    }

    res.json(getTest(req.params.id));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const photos = fetchPhotos(req.params.id);
    const videos = prepare('SELECT file_name FROM burn_test_videos WHERE burn_test_id = ?').all(req.params.id);
    const r = prepare('DELETE FROM burn_tests WHERE id = ?').run(req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });

    // ON DELETE CASCADE đã tự xóa các bản ghi liên quan trong DB.
    for (const p of photos) deletePhotoFile(p.file_name);
    for (const video of videos) deleteVideoFile(video.file_name);
    res.status(204).send();
  } catch (err) {
    if (String(err.message || '').includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Không thể xóa bản ghi test' });
    }
    next(err);
  }
});

function parseSlot(raw) {
  const slotMatch = String(raw ?? '').trim().toUpperCase().match(/^PIC[_-]?(\d+)$/);
  const slot = slotMatch ? Number(slotMatch[1]) : Number(raw);
  if (!Number.isInteger(slot) || slot < 1 || slot > 99) throw new Error('slot phải từ 1 đến 99');
  return slot;
}

router.post(['/:id/photos', '/:id/images'], upload.single('file'), (req, res, next) => {
  try {
    const test = prepare(`
      SELECT bt.id, bt.product_code, bt.test_date, po.po_number
      FROM burn_tests bt JOIN purchase_orders po ON po.id = bt.purchase_order_id
      WHERE bt.id = ?
    `).get(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const slot = parseSlot(req.body.slot ?? req.body.pic_slot);
    const ext = (path.extname(req.file.originalname).toLowerCase() || '.jpg').replace(/[^a-z0-9.]/g, '');
    // Cấu trúc: {po_number}/{product_code}/{test_date}/burn-test-{test_id}-{slot}.{ext}
    const relPath = buildPhotoPath(test.id, test.po_number, test.product_code, test.test_date, slot, ext);

    const old = prepare('SELECT file_name FROM burn_test_photos WHERE burn_test_id = ? AND slot = ?').get(req.params.id, slot);

    writeUploadFile(relPath, req.file.buffer);
    const fileUrl = `/uploads/${relPath}`;

    prepare(`INSERT INTO burn_test_photos (burn_test_id, slot, file_name, file_url, original_name, mime_type, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(burn_test_id, slot) DO UPDATE SET
        file_name=excluded.file_name, file_url=excluded.file_url, original_name=excluded.original_name,
        mime_type=excluded.mime_type, file_size=excluded.file_size, created_at=datetime('now')`)
      .run(Number(req.params.id), slot, relPath, fileUrl, req.file.originalname, req.file.mimetype, req.file.size);

    // Nếu ảnh cũ có đuôi file khác (vd .png -> .jpg) thì path sẽ khác -> xóa file cũ để tránh rác.
    if (old?.file_name && old.file_name !== relPath) deletePhotoFile(old.file_name);

    prepare("UPDATE burn_tests SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json(getTest(req.params.id));
  } catch (err) { next(err); }
});

router.delete('/:id/photos/:slot', (req, res, next) => {
  try {
    const slot = parseSlot(req.params.slot);
    const photo = prepare('SELECT file_name FROM burn_test_photos WHERE burn_test_id = ? AND slot = ?').get(req.params.id, slot);
    if (!photo) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

    prepare('DELETE FROM burn_test_photos WHERE burn_test_id = ? AND slot = ?').run(req.params.id, slot);
    deletePhotoFile(photo.file_name);
    prepare("UPDATE burn_tests SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/:id/videos', (req, res, next) => {
  try {
    if (!prepare('SELECT id FROM burn_tests WHERE id = ?').get(req.params.id)) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });
    }
    res.json(fetchVideos(req.params.id));
  } catch (err) { next(err); }
});

router.post('/:id/videos', handleVideoUpload, (req, res, next) => {
  let relPath;
  try {
    const test = prepare(`
      SELECT bt.id, bt.product_code, bt.test_date, po.po_number
      FROM burn_tests bt JOIN purchase_orders po ON po.id = bt.purchase_order_id
      WHERE bt.id = ?
    `).get(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });
    if (!req.file) return res.status(400).json({ error: 'Thiếu file video' });

    const duration = Number(req.body.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 30) {
      return res.status(400).json({ error: 'Video phải dài hơn 0 và không quá 30 giây' });
    }

    const format = getVideoFormat(req.file);
    if (!format) return res.status(400).json({ error: 'Không xác định được định dạng video. Chỉ chấp nhận MP4, WEBM hoặc MOV' });
    if (!req.file.size) return res.status(400).json({ error: 'File video không có dữ liệu' });

    const filename = `burn-test-${test.id}-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${format.extension}`;
    relPath = `${buildTestUploadDirectory(test.po_number, test.product_code, test.test_date)}/${filename}`;
    writeUploadFile(relPath, req.file.buffer);
    const fileUrl = `/uploads/${relPath}`;
    try {
      prepare(`INSERT INTO burn_test_videos
        (burn_test_id, file_name, file_url, original_name, mime_type, file_size, duration_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        Number(req.params.id), relPath, fileUrl, req.file.originalname, format.mimeType, req.file.size, duration
      );
    } catch (err) {
      deleteVideoFile(relPath);
      throw err;
    }
    prepare("UPDATE burn_tests SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.status(201).json(fetchVideos(req.params.id));
  } catch (err) {
    if (relPath) deleteVideoFile(relPath);
    next(err);
  }
});

router.delete('/:id/videos/:videoId', (req, res, next) => {
  try {
    const video = prepare('SELECT id, file_name FROM burn_test_videos WHERE id = ? AND burn_test_id = ?')
      .get(req.params.videoId, req.params.id);
    if (!video) return res.status(404).json({ error: 'Không tìm thấy video' });
    prepare('DELETE FROM burn_test_videos WHERE id = ?').run(video.id);
    deleteVideoFile(video.file_name);
    prepare("UPDATE burn_tests SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ---------- Log kiểm tra định kỳ (VD: mỗi 2 giờ ghi 1 lần trong lúc đốt) ----------
function validateLogPayload(body, partial = false) {
  const payload = {
    time_label: body.time_label !== undefined ? String(body.time_label ?? '').trim() : undefined,
    wick_status: body.wick_status !== undefined ? String(body.wick_status ?? '').trim() : undefined,
    flame_status: body.flame_status !== undefined ? String(body.flame_status ?? '').trim() : undefined,
    wick_height_mm: body.wick_height_mm !== undefined ? body.wick_height_mm : undefined,
    vessel_condition: body.vessel_condition !== undefined ? String(body.vessel_condition ?? '').trim() : undefined,
    temperature_c: body.temperature_c !== undefined ? body.temperature_c : undefined,
    note: body.note !== undefined ? (body.note === '' ? null : String(body.note)) : undefined
  };

  if (!partial) {
    if (!payload.time_label) throw new Error('time_label (thời gian, VD: 2H) là bắt buộc');
    if (!payload.wick_status) throw new Error('wick_status (trạng thái bấc) là bắt buộc');
    if (!payload.flame_status) throw new Error('flame_status (trạng thái ngọn lửa) là bắt buộc');
    if (!payload.vessel_condition) throw new Error('vessel_condition (tình trạng bể đốt) là bắt buộc');
    if (payload.wick_height_mm === undefined || payload.wick_height_mm === null || payload.wick_height_mm === '') {
      throw new Error('wick_height_mm (chiều cao bấc) là bắt buộc');
    }
    if (payload.temperature_c === undefined || payload.temperature_c === null || payload.temperature_c === '') {
      throw new Error('temperature_c (nhiệt độ) là bắt buộc');
    }
  }
  for (const [name, value] of [['wick_height_mm', payload.wick_height_mm], ['temperature_c', payload.temperature_c]]) {
    if (value !== undefined && value !== null && value !== '' && !Number.isFinite(Number(value))) {
      throw new Error(`${name} phải là số`);
    }
  }

  Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });
  if (payload.wick_height_mm !== undefined) payload.wick_height_mm = payload.wick_height_mm === '' ? null : Number(payload.wick_height_mm);
  if (payload.temperature_c !== undefined) payload.temperature_c = payload.temperature_c === '' ? null : Number(payload.temperature_c);
  return payload;
}

router.get('/:id/logs', (req, res, next) => {
  try {
    const test = prepare('SELECT id FROM burn_tests WHERE id = ?').get(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });
    res.json(fetchLogs(req.params.id));
  } catch (err) { next(err); }
});

router.post('/:id/logs', (req, res, next) => {
  try {
    const test = prepare('SELECT id FROM burn_tests WHERE id = ?').get(req.params.id);
    if (!test) return res.status(404).json({ error: 'Không tìm thấy bản ghi test' });

    const p = validateLogPayload(req.body, false);
    const r = prepare(`INSERT INTO burn_test_logs
      (burn_test_id, time_label, wick_status, flame_status, wick_height_mm, vessel_condition, temperature_c, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Number(req.params.id), p.time_label, p.wick_status, p.flame_status,
      p.wick_height_mm, p.vessel_condition, p.temperature_c, p.note ?? null
    );
    const row = prepare('SELECT * FROM burn_test_logs WHERE id = ?').get(r.lastInsertRowid);
    try { const ev=evaluateTest(req.params.id); if(ev.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', req.params.id); } catch (_) {}
    res.status(201).json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id/logs/:logId', (req, res, next) => {
  try {
    const existing = prepare('SELECT id FROM burn_test_logs WHERE id = ? AND burn_test_id = ?').get(req.params.logId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy log' });

    const p = validateLogPayload(req.body, true);
    const fields = Object.keys(p);
    if (!fields.length) return res.status(400).json({ error: 'Không có dữ liệu để cập nhật' });

    const setSql = fields.map(f => `${f} = ?`).join(', ');
    prepare(`UPDATE burn_test_logs SET ${setSql} WHERE id = ?`).run(...fields.map(f => p[f]), req.params.logId);

    const row = prepare('SELECT * FROM burn_test_logs WHERE id = ?').get(req.params.logId);
    try { const ev=evaluateTest(req.params.id); if(ev.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', req.params.id); } catch (_) {}
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id/logs/:logId', (req, res, next) => {
  try {
    prepare('DELETE FROM burn_test_logs WHERE id = ? AND burn_test_id = ?').run(req.params.logId, req.params.id);
    try { const ev=evaluateTest(req.params.id); if(ev.status === 'FAIL') prepare("UPDATE burn_tests SET result=?, updated_at=datetime('now') WHERE id=?").run('FAIL', req.params.id); } catch (_) {}
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
