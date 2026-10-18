# Burn Test QC — Dashboard UI Upgrade

Bản nâng cấp giao diện Dashboard theo mẫu tham khảo:
- Sidebar điều hướng bên trái trên desktop.
- Dashboard Báo cáo tuần dạng KPI cards.
- Biểu đồ cột nhóm theo ngày: Đạt (PASS) / Không đạt (FAIL) / Pending, 3 cột đứng cạnh nhau giống biểu đồ Excel mẫu.
- Hiển thị giá trị trên đầu từng cột.
- PDF và Excel dùng cùng kiểu biểu đồ cột nhóm.
- Giữ nguyên SQLite, import Excel tự động Customer/PO/Product và các chức năng QC hiện có.

## Chạy
```bash
npm install
npm start
```
Mở: http://localhost:3000

## Camera trên iPhone trong mạng nội bộ

Camera trực tiếp cần HTTPS. Khi chứng chỉ cục bộ đã được tạo, khởi động lại app và mở `https://testdot-pc:3443/` trên iPhone. Tải chứng chỉ CA tại `http://testdot-pc:3001/testdot-pc-root-ca.cer`, cài trong **Settings > General > VPN & Device Management**, sau đó bật tin cậy tại **Settings > General > About > Certificate Trust Settings**. Chỉ cài CA này trên thiết bị tin cậy; chứng chỉ riêng của server nằm ngoài workspace.

## Video bằng chứng Burn Test

Trong chi tiết Burn Test, chọn **Quay video** để mở camera gốc của điện thoại; xoay ngang máy trước khi quay để video lưu theo hướng camera. Trên máy tính, nút quay dùng camera của trình duyệt; **Tải video từ máy tính** cho phép chọn video có sẵn. Khi xem ảnh hoặc video trong ứng dụng, con dấu gồm mã hàng, PO, màu/bấc, kích thước và khối lượng được phủ trên khung hiển thị; dùng nút phóng to riêng cho video để mở toàn màn hình cùng con dấu. Menu chuột phải trên ảnh cho phép copy ảnh gốc hoặc copy ảnh kèm con dấu. File ảnh và video gốc không bị chèn con dấu. Những ảnh đã lưu trước thay đổi này có thể đã chứa con dấu trong file gốc. Video MP4, WEBM hoặc MOV được nhận khi dài tối đa 30 giây và dung lượng không quá 150 MB; quay trực tiếp bằng trình duyệt cần `getUserMedia`/`MediaRecorder`, còn camera gốc trên điện thoại cần quyền truy cập tệp media.

Trong chi tiết Burn Test hoặc menu **Nghiệp vụ > Hướng dẫn đánh giá**, mở **Hướng dẫn đánh giá Burn Test**. Nội dung được chia thành hai tab: **Đánh giá mức độ muội** và **Tình trạng nến**. Bảng tình trạng nến gồm phân loại bấc A–G, ngọn lửa A–E và bát đốt A–D, kèm hình minh họa. Theo hướng dẫn muội, Class 5–3 là mức chấp nhận được; Class 2–1 không chấp nhận. Tài liệu hình ảnh được lưu tại `public/guides/`.

V10.1: Fixed Settings full-width layout. The Settings page no longer inherits the legacy two-column `.layout` (400px + 1fr), so each settings panel uses the complete available content width. Mobile remains single-column.

Ảnh và video Burn Test được lưu chung theo cấu trúc `uploads/{PO}/{mã hàng}/{ngày test}/`. Tên video có ID bản ghi test cùng dấu thời gian và mã ngẫu nhiên để nhiều video không ghi đè nhau. Khi thay đổi PO, mã hàng hoặc ngày test, cả ảnh và video của bản ghi cũng được chuyển sang thư mục nhận diện mới.
