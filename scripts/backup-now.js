/*
  Chạy backup ngay lập tức, không cần server đang chạy.

  Cách dùng:
    node scripts/backup-now.js

  Có thể đặt lịch chạy tự động qua Windows Task Scheduler:
    1) Mở Task Scheduler -> Create Basic Task
    2) Trigger: chọn lịch mong muốn (VD: hàng ngày lúc 18:00, hoặc mỗi 6 giờ)
    3) Action: Start a program
       Program/script: node
       Arguments: scripts/backup-now.js
       Start in: đường dẫn thư mục project (VD: D:\HIEU\App_InLine\burntest_supabase_ready)

  Có thể tùy chỉnh nơi lưu qua .env:
    BACKUP_DIR=./backups     nơi lưu backup (mặc định: thư mục backups/ trong project)
  Hệ thống luôn giữ lại tối đa 5 bản backup gần nhất.
*/
require('dotenv').config();
const { backupNow, BACKUP_DIR, BACKUP_KEEP } = require('../lib/backup');

try {
  console.log(`Đang backup vào: ${BACKUP_DIR} (giữ tối đa ${BACKUP_KEEP} bản gần nhất)...`);
  const folder = backupNow();
  console.log(`✔ Backup thành công: ${folder}`);
} catch (err) {
  console.error('✖ Backup thất bại:', err.message);
  process.exitCode = 1;
}
