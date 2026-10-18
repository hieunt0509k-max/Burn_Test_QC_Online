process.removeAllListeners('warning'); // ẩn cảnh báo "SQLite is experimental" của node:sqlite cho gọn log
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const https = require('https');
const os = require('os');
const path = require('path');
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
