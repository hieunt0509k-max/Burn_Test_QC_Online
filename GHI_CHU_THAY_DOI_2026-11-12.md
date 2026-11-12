# Ghi chú thay đổi ngày 12/11/2026 (kiểm tra & nâng cấp)

## Bảo mật
- JWT: không còn khóa mặc định trong mã. Khóa tự sinh lưu ở `data/.jwt-secret` (hoặc dùng `JWT_SECRET`). Hỗ trợ `JWT_TTL`. **Mọi người dùng cần đăng nhập lại 1 lần.**
- `ADMIN_USER` / `ADMIN_PASSWORD` có tác dụng khi tạo admin ban đầu; `CORS_ORIGIN` có tác dụng.
- Đăng nhập sai 8 lần (cùng IP + tài khoản) bị khóa 5 phút.
- Chỉ admin được restore backup.
- Sửa lỗi xóa file ngoài `assets/` qua DELETE mẫu báo cáo (path traversal).
- Upload ảnh (test, hàng mẫu, khách kiểm): chỉ nhận đuôi ảnh hợp lệ (`lib/imageExt.js`); `/uploads` có `nosniff`, file `.html/.svg` bị ép tải xuống.
- PUT settings không ghi đè `report_logo_path`; xóa logo chỉ xóa file trong thư mục logo.

## Ổn định
- Thiếu font không còn làm server không khởi động; chỉ báo lỗi khi xuất PDF tuần.
- Cài mới: thêm các cột `start_datetime`, `end_datetime`, `total_burn_time`, `test_result`, `approved` cho `sample_burn_tests` (trước đây cần chạy tay migrate_sample_v2.js, nếu không tạo test hàng mẫu bị lỗi).
- SQLite: `busy_timeout`, `synchronous=NORMAL`; thêm index cho "Chỉ mã chưa test" và lọc ngày.
- Backup dùng `VACUUM INTO` (fallback copy file); dừng server êm bằng SIGINT/SIGTERM.

## Giao diện
- Trang chủ: sửa lỗi ghi vào `#homeAlerts` không tồn tại; lỗi tải Dashboard giờ hiện ở dòng đồng bộ.
- Bỏ handler `changeProductCode` không tồn tại; thêm `alt` cho ảnh logo.

## Kiểm tra
Chạy server thật trên DB trống: 49 kiểm tra API đạt (đăng nhập/khóa, token giả, import Excel, upload ảnh độc hại, path traversal, phân quyền, backup, báo cáo tuần PDF/XLSX, logo...). Giao diện chỉ kiểm tra cú pháp JS.
Không có thư mục `assets/` trong zip nên chưa kiểm tra xuất theo mẫu Excel (po-sku, MAU_BURN_TEST_REPORT).
