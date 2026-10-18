/*
  Kéo toàn bộ dữ liệu từ Supabase (Postgres + Storage) xuống SQLite local.

  Cách chạy:
    1) Tạo file .env ở thư mục gốc project với nội dung:
         SUPABASE_URL=https://xxxxx.supabase.co
         SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx...
         SUPABASE_STORAGE_BUCKET=burn-test-photos   (tên bucket ảnh, nếu khác mặc định)
       (Lấy 2 giá trị đầu trong Supabase Dashboard -> Project Settings -> API)
    2) npm install   (để có @supabase/supabase-js)
    3) node scripts/migrate-from-supabase.js
       Thêm --dry-run để chỉ xem trước số lượng sẽ chuyển, không ghi gì vào local:
       node scripts/migrate-from-supabase.js --dry-run

  Script sẽ:
    - Copy customers, purchase_orders, burn_tests, burn_test_logs từ Supabase vào SQLite local.
    - Tải toàn bộ ảnh từ Supabase Storage về uploads/ (giữ nguyên cấu trúc thư mục
      {po_number}/{product_code}/burn-test-{slot}.ext), rồi ghi record vào burn_test_photos.
    - Khách hàng trùng tên / PO trùng (customer+po_number) sẽ được nối vào bản ghi có sẵn
      thay vì tạo trùng, nên có thể chạy lại an toàn nếu bị gián đoạn giữa chừng.
    - burn_tests thì luôn insert mới (không có khóa tự nhiên để dedup an toàn) -> khuyến khích
      chạy trên database local còn trống. Nếu bảng burn_tests local đã có dữ liệu, script sẽ
      hỏi xác nhận trước khi tiếp tục.
*/
require('dotenv').config();

const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const { prepare, transaction, UPLOADS_DIR } = require('../database/database');

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'burn-test-photos';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file .env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function fetchAll(table, select = '*') {
  const { data, error } = await supabase.from(table).select(select).order('id');
  if (error) throw new Error(`Lấy dữ liệu ${table}: ${error.message}`);
  return data || [];
}

async function downloadPhoto(fileName) {
  const { data, error } = await supabase.storage.from(BUCKET).download(fileName);
  if (error) throw new Error(`Tải ảnh ${fileName}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

const fs = require('fs');
function writeLocalPhoto(relPath, buffer) {
  const diskPath = path.join(UPLOADS_DIR, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  fs.writeFileSync(diskPath, buffer);
}

async function main() {
  console.log(`Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`Bucket ảnh: ${BUCKET}${DRY_RUN ? '  (DRY RUN — chỉ xem trước)' : ''}\n`);

  console.log('Đang tải dữ liệu từ Supabase...');
  const customers = await fetchAll('customers', 'id,name,created_at');
  const pos = await fetchAll('purchase_orders', 'id,customer_id,po_number,created_at');
  const tests = await fetchAll('burn_tests');
  const photos = await fetchAll('burn_test_photos');
  const logs = await fetchAll('burn_test_logs');

  console.log(`  customers: ${customers.length}`);
  console.log(`  purchase_orders: ${pos.length}`);
  console.log(`  burn_tests: ${tests.length}`);
  console.log(`  burn_test_photos: ${photos.length}`);
  console.log(`  burn_test_logs: ${logs.length}\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — dừng ở đây, chưa ghi gì vào local. Chạy lại không kèm --dry-run để thực hiện.');
    return;
  }

  const existingTestCount = prepare('SELECT COUNT(*) AS c FROM burn_tests').get().c;
  if (existingTestCount > 0) {
    const ans = await ask(`⚠ Database local hiện đã có ${existingTestCount} burn test. Tiếp tục có thể tạo dữ liệu trùng. Gõ "yes" để tiếp tục: `);
    if (ans.trim().toLowerCase() !== 'yes') { console.log('Đã hủy.'); return; }
  }

  console.log('\nĐang ghi customers + purchase_orders + burn_tests + burn_test_logs vào SQLite local...');
  const customerIdMap = new Map();
  const poIdMap = new Map();
  const testIdMap = new Map();

  transaction(() => {
    for (const c of customers) {
      let row = prepare('SELECT id FROM customers WHERE name = ?').get(c.name);
      if (!row) {
        const r = prepare('INSERT INTO customers (name, created_at) VALUES (?, ?)').run(c.name, c.created_at || new Date().toISOString());
        row = { id: Number(r.lastInsertRowid) };
      }
      customerIdMap.set(c.id, row.id);
    }

    for (const p of pos) {
      const newCustomerId = customerIdMap.get(p.customer_id);
      if (!newCustomerId) { console.warn(`⚠ Bỏ qua PO #${p.id}: không map được customer_id ${p.customer_id}`); continue; }
      let row = prepare('SELECT id FROM purchase_orders WHERE customer_id = ? AND po_number = ?').get(newCustomerId, p.po_number);
      if (!row) {
        const r = prepare('INSERT INTO purchase_orders (customer_id, po_number, created_at) VALUES (?, ?, ?)')
          .run(newCustomerId, p.po_number, p.created_at || new Date().toISOString());
        row = { id: Number(r.lastInsertRowid) };
      }
      poIdMap.set(p.id, row.id);
    }

    const insertTest = prepare(`INSERT INTO burn_tests
      (purchase_order_id, product_code, diameter_mm, height_mm, fragrance, color, wick, temperature_c,
       test_date, test_time, start_datetime, end_datetime, total_burn_time, tester, approver, result, note,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const t of tests) {
      const newPoId = poIdMap.get(t.purchase_order_id);
      if (!newPoId) { console.warn(`⚠ Bỏ qua test #${t.id}: không map được purchase_order_id ${t.purchase_order_id}`); continue; }
      const r = insertTest.run(
        newPoId, t.product_code, t.diameter_mm, t.height_mm, t.fragrance, t.color, t.wick, t.temperature_c,
        t.test_date, t.test_time, t.start_datetime, t.end_datetime, t.total_burn_time, t.tester, t.approver,
        t.result || 'PENDING', t.note,
        t.created_at || new Date().toISOString(), t.updated_at || new Date().toISOString()
      );
      testIdMap.set(t.id, Number(r.lastInsertRowid));
    }

    const insertLog = prepare(`INSERT INTO burn_test_logs
      (burn_test_id, time_label, wick_status, flame_status, wick_height_mm, vessel_condition, temperature_c, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const l of logs) {
      const newTestId = testIdMap.get(l.burn_test_id);
      if (!newTestId) continue;
      insertLog.run(newTestId, l.time_label, l.wick_status, l.flame_status, l.wick_height_mm,
        l.vessel_condition, l.temperature_c, l.note, l.created_at || new Date().toISOString());
    }
  });

  console.log(`  -> ${customerIdMap.size} customers, ${poIdMap.size} PO, ${testIdMap.size} burn tests, ${logs.length} log đã ghi.\n`);

  console.log('Đang tải ảnh từ Supabase Storage về uploads/ ...');
  const insertPhoto = prepare(`INSERT INTO burn_test_photos
    (burn_test_id, slot, file_name, file_url, original_name, mime_type, file_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  let photosDone = 0, photosFailed = 0;
  for (const p of photos) {
    const newTestId = testIdMap.get(p.burn_test_id);
    if (!newTestId) continue;
    try {
      const buffer = await downloadPhoto(p.file_name);
      writeLocalPhoto(p.file_name, buffer);
      const fileUrl = `/uploads/${p.file_name}`;
      insertPhoto.run(newTestId, p.slot, p.file_name, fileUrl, p.original_name, p.mime_type, p.file_size, p.created_at || new Date().toISOString());
      photosDone++;
      process.stdout.write(`\r  Đã tải: ${photosDone}/${photos.length}`);
    } catch (err) {
      photosFailed++;
      console.warn(`\n⚠ Lỗi tải ảnh ${p.file_name}: ${err.message}`);
    }
  }
  console.log(`\n\n=== HOÀN TẤT ===`);
  console.log(`Ảnh đã tải: ${photosDone}/${photos.length}${photosFailed ? `  (lỗi: ${photosFailed})` : ''}`);
  console.log('\nDữ liệu đã sẵn sàng trong data/burn_test.db và uploads/. Chạy "npm start" để dùng.');
}

main().catch(err => {
  console.error('\n✖ Migration failed:', err);
  process.exitCode = 1;
});
