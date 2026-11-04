# Ghi chú thay đổi ngày 28/10/2026

## Sản phẩm

- Bấm vào phần nội dung của một dòng trong danh sách để mở form chi tiết/chỉnh sửa. Các nút và ô thao tác trên dòng vẫn giữ hành vi riêng; bấm mã hàng vẫn mở luồng tạo test hàng mẫu.
- Bộ lọc đơn hàng/PO đổi thành ô tìm kiếm, có thể gõ để chọn nhanh.
- Thêm tùy chọn **Chỉ mã chưa test**. Mã được xem là đã test nếu có bản ghi Burn Test hoặc test hàng mẫu cùng PO; so khớp mã không phân biệt chữ hoa/thường.
- Import bổ sung cột E (**Mã PO khách**) và cột H (**Mã khách hàng/SKU**). Hai trường được lưu, hiển thị trong danh sách và form sửa. Khi import lại sản phẩm đã có, cập nhật hai mã này nếu file có dữ liệu mà không ghi đè các thông tin sản phẩm khác.
- Thêm nút xuất Excel **Mã PO khách / SKU**. File dùng trực tiếp mẫu `assets/po-sku.xlsx`, giữ bố cục và định dạng Times New Roman, khổ A5 ngang, tối đa 6 nhãn mỗi trang; hỗ trợ in các mã đã chọn hoặc sản phẩm của PO đang lọc.

## Nhật ký test đốt

- Tăng số mã hiển thị từ 10 lên 20 mã mỗi trang; phân trang và chọn tất cả trên trang dùng cùng giới hạn.

## Ảnh khách kiểm

- Khi tạo mã mới và chọn đơn hàng, tải danh sách mã khách hàng (cột H trong dữ liệu sản phẩm) của đơn để hiện gợi ý; vẫn có thể nhập mã mới.
- Chuyển dòng thông báo số mã đã tải lên phía trên các ô **Đơn hàng mới** và **Mã khách hàng mới**, để hai ô nằm cạnh nhau.
- Trong danh sách mã, nếu chưa có ảnh khách kiểm sẽ hiển thị ảnh sản phẩm cùng PO. Ưu tiên đối chiếu mã khách hàng, sau đó đối chiếu mã sản phẩm. Khi đã có ảnh khách kiểm, ảnh đó được ưu tiên.

## Kiểm tra đã thực hiện

- Kiểm tra cú pháp JavaScript phía trình duyệt và cú pháp các route/database liên quan.
- Chạy thử SQL đối chiếu mã chưa test và ảnh sản phẩm dự phòng trên SQLite tạm.
- Tạo file Excel thử từ mẫu PO-SKU; kiểm tra giá trị PO/SKU, font, thiết lập A5 và ngắt trang sau 6 nhãn.
