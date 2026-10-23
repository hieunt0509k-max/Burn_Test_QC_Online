process.removeAllListeners('warning'); // ẩn cảnh báo "SQLite is experimental" của node:sqlite cho gọn log
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const https = require('https');
const os = require('os');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');
require('dotenv').config();
const { UPLOADS_DIR } = require('./database/database'); // require để đảm bảo DB/schema được khởi tạo ngay khi start
const { backupNow, BACKUP_DIR, BACKUP_KEEP } = require('./lib/backup');

const clientsRouter = require('./routes/clients');
const posRouter = require('./routes/pos');
const burnTestsRouter = require('./routes/burnTests');
const productsRouter = require('./routes/products');
const settingsRouter = require('./routes/settings');
const sampleTestsRouter = require('./routes/sampleTests');
const customerChecksRouter = require('./routes/customerChecks');
const { optionalAuth, requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const HTTPS_CERT_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'BurnTestQC', 'https'
);
const HTTPS_PFX_PATH = process.env.HTTPS_PFX_PATH || path.join(HTTPS_CERT_DIR, 'testdot-pc.pfx');
const HTTPS_PFX_PASSPHRASE_PATH = process.env.HTTPS_PFX_PASSPHRASE_PATH || path.join(HTTPS_CERT_DIR, 'testdot-pc.pass');
const BACKUP_INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS) || 6;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Đọc token ở mọi request (gán req.user nếu có)
app.use(optionalAuth);

// Auth API
app.use('/api/v1/auth', authRouter);

// Helper: chỉ chặn các method ghi
const protectWrites = (req, res, next) => {
  const m = req.method.toUpperCase();
  if(['POST','PUT','PATCH','DELETE'].includes(m)) return requireAuth(req, res, next);
  next();
};

// Áp cho tất cả route nghiệp vụ
['/api/v1/po-details',
 '/api/v1/products',
 '/api/v1/clients',
 '/api/v1/pos',
 '/api/v1/settings',
 '/api/v1/sample-tests',
 '/api/v1/burn-tests'
 ,'/api/v1/customer-checks'
]
.forEach(path => app.use(path, protectWrites));
app.use('/uploads', express.static(UPLOADS_DIR));

function normalizeTemplateKey(value = '') {
  return String(value)
    .trim()
    .replace(/\.[^./\\]+$/i, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function scanReportTemplates(baseDir) {
  const map = {};

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(xlsx?|xls)$/i.test(entry.name)) continue;

      const baseName = path.basename(entry.name, path.extname(entry.name));
      const aliases = new Set([
        entry.name,
        baseName,
        baseName.toLowerCase(),
        normalizeTemplateKey(entry.name),
        normalizeTemplateKey(baseName),
        baseName.replace(/[_\s]+/g, '-'),
        baseName.toLowerCase().replace(/[_\s]+/g, '-')
      ]);

      for (const alias of aliases) {
        const key = normalizeTemplateKey(alias);
        if (!key) continue;
        map[key] = { sourcePath: fullPath, downloadName: entry.name };
      }
    }
  }

  walk(baseDir);
  return map;
}

const REPORT_TEMPLATE_DIR = path.join(__dirname, 'assets');
fs.mkdirSync(REPORT_TEMPLATE_DIR, { recursive: true });

const reportTemplateStorage = multer.diskStorage({
  destination: REPORT_TEMPLATE_DIR,
  filename: (_req, file, cb) => {
    const baseName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'report-template';
    const ext = path.extname(file.originalname).toLowerCase();
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${baseName}-${suffix}${ext}`);
  }
});

const reportTemplateUpload = multer({
  storage: reportTemplateStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isExcel = /\.(xlsx?|xls)$/i.test(file.originalname);
    if (!isExcel) return cb(new Error('Chỉ hỗ trợ file Excel .xlsx / .xls'));
    cb(null, true);
  }
});

function getReportTemplates() {
  return scanReportTemplates(REPORT_TEMPLATE_DIR);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

app.get('/report-templates/:template/preview', async (req, res, next) => {
  const templates = getReportTemplates();
  const lookupKey = normalizeTemplateKey(req.params.template);
  const template = templates[lookupKey] || null;
  if (!template) return res.status(404).send('Không tìm thấy mẫu báo cáo');
  if (!/\.xlsx$/i.test(template.downloadName)) {
    return res.status(415).send('Xem trước chỉ hỗ trợ file .xlsx. Vui lòng tải file .xls để mở bằng Excel.');
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template.sourcePath);
    const worksheets = workbook.worksheets.map(worksheet => {
      let rows = '';
      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const cells = [];
        for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
          const cell = row.getCell(columnNumber);
          const content = escapeHtml(cell.isMerged && cell.master.address !== cell.address ? '' : cell.text);
          cells.push(rowNumber === 1
            ? `<th>${content || '&nbsp;'}</th>`
            : `<td>${content || '&nbsp;'}</td>`);
        }
        rows += `<tr>${cells.join('')}</tr>`;
      });
      return `<section class="sheet"><h2>${escapeHtml(worksheet.name)}</h2><div class="table-wrap"><table>${rows}</table></div></section>`;
    }).join('');
    const downloadUrl = `/report-templates/${encodeURIComponent(template.downloadName)}`;
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xem trước: ${escapeHtml(template.downloadName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; color: #1f2937; }
  .wrap { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
  .head, .sheet { background: white; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.05); }
  .head { padding: 18px 22px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 21px; }
  .meta { color: #4b5563; margin-top: 8px; font-size: 13px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .btn { display: inline-block; padding: 9px 14px; border-radius: 7px; text-decoration: none; font-weight: 600; }
  .primary { background: #187dcc; color: white; }
  .note { color: #667085; font-size: 12px; margin: 14px 2px; }
  .sheet { margin-bottom: 16px; overflow: hidden; }
  h2 { font-size: 16px; margin: 0; padding: 13px 16px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
  .table-wrap { overflow: auto; max-height: 72vh; }
  table { border-collapse: collapse; min-width: 100%; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 9px; text-align: left; vertical-align: top; white-space: pre-wrap; min-width: 80px; }
  th { background: #f1f5f9; position: sticky; top: 0; }
  @media (max-width: 640px) { .wrap { margin: 12px auto; padding: 0 8px; } .head { padding: 15px; } }
</style>
</head>
<body>
  <main class="wrap">
    <header class="head">
      <h1>Xem trước mẫu báo cáo</h1>
      <div class="meta">File: ${escapeHtml(template.downloadName)}</div>
      <div class="actions"><a class="btn primary" href="${downloadUrl}" download>⇩ Tải xuống file Excel</a></div>
    </header>
    <p class="note">Đây là bản xem nội dung các ô trong file. Bố cục, định dạng và biểu đồ có thể khác khi mở bằng Excel.</p>
    ${worksheets || '<section class="sheet"><p class="note">File không có sheet để hiển thị.</p></section>'}
  </main>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

app.get('/report-templates/:template', (req, res, next) => {
  const templates = getReportTemplates();
  const lookupKey = normalizeTemplateKey(req.params.template);
  const template = templates[lookupKey] || null;
  if (!template) return res.status(404).send('Không tìm thấy mẫu báo cáo');
  res.setHeader('Content-Disposition', 'inline; filename="' + template.downloadName + '"');
  res.sendFile(template.sourcePath, err => {
    if (err) next(err);
  });
});

app.get('/api/v1/settings/report-templates', (_req, res) => {
  const templates = Object.values(getReportTemplates()).sort((a, b) => a.downloadName.localeCompare(b.downloadName, 'vi'));
  res.json({
    ok: true,
    templates: templates.map(t => ({
      name: t.downloadName,
      url: `/report-templates/${encodeURIComponent(t.downloadName)}`,
      previewUrl: `/report-templates/${encodeURIComponent(t.downloadName)}/preview`
    }))
  });
});

app.post('/api/v1/settings/report-templates', (req, res, next) => {
  reportTemplateUpload.single('template')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn. Tối đa 20MB.' });
      }
      return res.status(400).json({ error: err.message || 'Không thể tải lên mẫu báo cáo.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx / .xls).' });
    }
    res.json({
      ok: true,
      message: 'Đã upload mẫu báo cáo thành công.',
      template: {
        name: req.file.originalname,
        fileName: req.file.filename,
        url: `/report-templates/${encodeURIComponent(req.file.filename)}`,
        previewUrl: `/report-templates/${encodeURIComponent(req.file.filename)}/preview`
      }
    });
  });
});

app.delete('/api/v1/settings/report-templates/:name', (req, res) => {
  const encodedName = decodeURIComponent(req.params.name || '');
  const targetFile = path.join(REPORT_TEMPLATE_DIR, encodedName);
  if (!encodedName || !fs.existsSync(targetFile) || !/\.(xlsx?|xls)$/i.test(encodedName)) {
    return res.status(404).json({ error: 'Không tìm thấy mẫu báo cáo để xóa.' });
  }
  fs.unlinkSync(targetFile);
  res.json({ ok: true, message: 'Đã xóa mẫu báo cáo.' });
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api', (_req, res) => res.json({
  message: 'Burn Test QC API - SQLite (local)',
  database: 'SQLite (node:sqlite)',
  storage: 'Local disk (/uploads)',
  endpoints: {
    customers: '/api/v1/clients',
    purchase_orders: '/api/v1/pos',
    burn_tests: '/api/v1/burn-tests',
    summary: '/api/v1/burn-tests/summary',
    weekly_summary: '/api/v1/burn-tests/weekly-summary?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD',
    weekly_report_pdf: '/api/v1/burn-tests/weekly-report.pdf?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD',
    weekly_report_xlsx: '/api/v1/burn-tests/weekly-report.xlsx?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD',
    photos: 'POST /api/v1/burn-tests/:id/photos',
    products: '/api/v1/products',
    backup: 'POST /api/v1/backup'
  }
}));

app.use('/api/v1/clients', clientsRouter);
app.use('/api/v1/pos', posRouter);
app.use('/api/v1/burn-tests', burnTestsRouter);
app.use('/api/v1/po-details', burnTestsRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/sample-tests', sampleTestsRouter);
app.use('/api/v1/customer-checks', customerChecksRouter);

// Backup thủ công (nút "💾 Backup ngay" trên giao diện gọi endpoint này).
app.post('/api/v1/backup', (_req, res) => {
  try {
    const folder = backupNow();
    res.json({ ok: true, folder });
  } catch (err) {
    res.status(500).json({ error: `Backup thất bại: ${err.message}` });
  }
});

// Mọi request /api/* không khớp route nào ở trên -> trả JSON 404 thay vì để Express
// trả về trang HTML mặc định (nguyên nhân phổ biến gây lỗi "Unexpected token '<'...
// is not valid JSON" ở phía frontend khi gọi nhầm endpoint hoặc server chưa restart).
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Lỗi máy chủ' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✔ Burn Test QC (SQLite local) đang chạy tại http://localhost:${PORT}`);

    // Backup ngay lúc khởi động (đảm bảo luôn có ít nhất 1 bản backup mới mỗi lần mở app),
    // rồi lặp lại định kỳ theo giờ trong lúc server vẫn đang chạy.
    try {
      const folder = backupNow();
      console.log(`  ↳ Đã backup: ${folder} (giữ tối đa ${BACKUP_KEEP} bản, thư mục ${BACKUP_DIR})`);
    } catch (err) {
      console.warn('  ⚠ Backup lúc khởi động thất bại:', err.message);
    }
    setInterval(() => {
      try {
        const folder = backupNow();
        console.log(`  ↳ Đã backup định kỳ: ${folder}`);
      } catch (err) {
        console.warn('  ⚠ Backup định kỳ thất bại:', err.message);
      }
    }, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
  });

  if (fs.existsSync(HTTPS_PFX_PATH)) {
    try {
      const tlsOptions = { pfx: fs.readFileSync(HTTPS_PFX_PATH) };
      if (process.env.HTTPS_PFX_PASSPHRASE) tlsOptions.passphrase = process.env.HTTPS_PFX_PASSPHRASE;
      else if (fs.existsSync(HTTPS_PFX_PASSPHRASE_PATH)) tlsOptions.passphrase = fs.readFileSync(HTTPS_PFX_PASSPHRASE_PATH, 'utf8').trim();
      https.createServer(tlsOptions, app)
        .listen(HTTPS_PORT, () => console.log(`✔ HTTPS camera access: https://testdot-pc:${HTTPS_PORT}`))
        .on('error', err => console.error('HTTPS listener error:', err.message));
    } catch (err) {
      console.error('HTTPS listener could not start:', err.message);
    }
  }
}
module.exports = app;
