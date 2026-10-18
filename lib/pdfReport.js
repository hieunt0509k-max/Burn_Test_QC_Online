const path = require('path');
const PDFDocument = require('pdfkit');
const { getBrand } = require('./reportBrand');

const FONT_REGULAR = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
const FONT_CJK = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansSC-Regular.ttf');
const FONT_CJK_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansSC-Bold.ttf');

const RESULT_LABEL = { PASS: 'ĐẠT', FAIL: 'KHÔNG ĐẠT', PENDING: 'CHỜ KẾT QUẢ' };
const RESULT_COLOR = { PASS: '#1f7a3f', FAIL: '#b3261e', PENDING: '#8a6d1a' };

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('vi-VN', { hour12: false });
}

function fmtVal(v, suffix = '') {
  if (v === null || v === undefined || v === '') return '—';
  return `${v}${suffix}`;
}

// ---------- Hỗ trợ chữ Hán xen lẫn trong text (VD: hương liệu/màu ghi bằng tiếng Trung) ----------
// DejaVu Sans (font chính, phủ tốt tiếng Việt) không có glyph tiếng Trung -> phải phát hiện
// từng đoạn ký tự CJK trong chuỗi và tự chuyển sang font NotoSansSC riêng cho đoạn đó.
function isCJKChar(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs (chữ Hán phổ thông)
         (code >= 0x3000 && code <= 0x303F) ||   // CJK punctuation
         (code >= 0xFF00 && code <= 0xFFEF);     // Fullwidth forms
}

function splitByScript(text) {
  const runs = [];
  let cur = '', curCJK = null;
  for (const ch of String(text ?? '')) {
    const cjk = isCJKChar(ch);
    if (curCJK === null) { curCJK = cjk; cur = ch; }
    else if (cjk === curCJK) { cur += ch; }
    else { runs.push({ text: cur, cjk: curCJK }); cur = ch; curCJK = cjk; }
  }
  if (cur) runs.push({ text: cur, cjk: curCJK });
  return runs;
}

// Vẽ 1 đoạn text có thể lẫn chữ Hán, tự chuyển font 'vn'/'vn-bold' <-> 'cjk'/'cjk-bold'
// cho từng đoạn ký tự liên tiếp cùng loại. Ký hiệu gọi giống doc.text(text, x, y, options).
function drawMixedText(doc, text, x, y, options = {}) {
  const bold = options.bold;
  const opts = { ...options };
  delete opts.bold;
  const runs = splitByScript(text);
  if (!runs.length) { doc.text('', x, y, opts); return; }

  runs.forEach((run, i) => {
    doc.font(run.cjk ? (bold ? 'cjk-bold' : 'cjk') : (bold ? 'vn-bold' : 'vn'));
    const isLast = i === runs.length - 1;
    const segOpts = { ...opts, continued: !isLast };
    if (i === 0) doc.text(run.text, x, y, segOpts);
    else doc.text(run.text, segOpts);
  });
}

const fs = require('fs/promises');

async function fetchImageBuffer(photo) {
  // Ưu tiên đọc trực tiếp từ đĩa (SQLite/local); nếu không có file_path (VD bản Supabase cũ)
  // thì fallback sang tải qua URL.
  if (photo.file_path) {
    return await fs.readFile(photo.file_path);
  }
  const res = await fetch(photo.file_url);
  if (!res.ok) throw new Error(`Tải ảnh thất bại (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function ensureSpace(doc, needed, margin = 40) {
  const bottom = doc.page.height - margin;
  if (doc.y + needed > bottom) doc.addPage();
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 30);
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('vn-bold').fontSize(12).fillColor('#b5622c').text(text.toUpperCase(), left, doc.y, { width: usable });
  doc.moveDown(0.15);
  const y = doc.y;
  doc.moveTo(left, y).lineTo(left + usable, y)
    .strokeColor('#d8cfc2').lineWidth(1).stroke();
  doc.fillColor('#1d1b18');
  doc.x = left;
  doc.moveDown(0.5);
}

function keyValueGrid(doc, pairs) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usable / 2;
  const labelWidth = 118;
  const rowH = 20;

  for (let i = 0; i < pairs.length; i += 2) {
    ensureSpace(doc, rowH);
    const y = doc.y;
    const rowPairs = [pairs[i], pairs[i + 1]].filter(Boolean);
    rowPairs.forEach(([label, value], idx) => {
      const x = left + idx * colWidth;
      doc.font('vn').fontSize(9.5).fillColor('#7a7266').text(label, x, y, { width: labelWidth });
      doc.fontSize(10.5).fillColor('#1d1b18');
      drawMixedText(doc, String(value), x + labelWidth, y, { width: colWidth - labelWidth - 10 });
    });
    doc.y = y + rowH;
  }
  doc.moveDown(0.3);
}

function logTable(doc, logs) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { key: 'time_label', label: 'Thời gian', w: 0.10 },
    { key: 'wick_status', label: 'Trạng thái bấc', w: 0.14 },
    { key: 'flame_status', label: 'Trạng thái ngọn lửa', w: 0.16 },
    { key: 'wick_height_mm', label: 'Chiều cao ngọn lửa', w: 0.13 },
    { key: 'vessel_condition', label: 'Tình trạng bể đốt', w: 0.15 },
    { key: 'temperature_c', label: 'Nhiệt độ', w: 0.10 },
    { key: 'note', label: 'Ghi chú', w: 0.22 }
  ].map(c => ({ ...c, w: c.w * usable }));

  if (!logs.length) {
    doc.font('vn').fontSize(10).fillColor('#7a7266').text('Chưa có log kiểm tra định kỳ.');
    doc.fillColor('#1d1b18');
    doc.moveDown(0.5);
    return;
  }

  function drawHeader() {
    doc.font('vn-bold').fontSize(8.5);
    const headerH = Math.max(...cols.map(c => doc.heightOfString(c.label, { width: c.w - 8 }))) + 12;
    ensureSpace(doc, headerH);
    const y = doc.y;
    let x = left;
    doc.rect(left, y, usable, headerH).fill('#f2ede4');
    doc.fillColor('#7a7266').font('vn-bold').fontSize(8.5);
    for (const c of cols) {
      doc.text(c.label, x + 4, y + 6, { width: c.w - 8 });
      x += c.w;
    }
    doc.y = y + headerH;
    doc.fillColor('#1d1b18');
  }

  ensureSpace(doc, 40);
  drawHeader();

  for (const log of logs) {
    const values = cols.map(c => {
      if (c.key === 'wick_height_mm') return fmtVal(log.wick_height_mm, ' mm');
      if (c.key === 'temperature_c') return fmtVal(log.temperature_c, '°C');
      return fmtVal(log[c.key]);
    });

    doc.font('vn').fontSize(9);
    const heights = values.map((v, i) => doc.heightOfString(v, { width: cols[i].w - 8 }));
    const rowH = Math.max(16, ...heights) + 8;

    ensureSpace(doc, rowH);
    const y = doc.y;
    let x = left;
    doc.fontSize(9).fillColor('#1d1b18');
    values.forEach((v, i) => {
      doc.font('vn'); // reset trước khi đo lại, drawMixedText sẽ tự chuyển font phù hợp bên trong
      drawMixedText(doc, v, x + 4, y + 4, { width: cols[i].w - 8 });
      x += cols[i].w;
    });
    doc.moveTo(left, y + rowH).lineTo(left + usable, y + rowH).strokeColor('#e5ded2').lineWidth(0.5).stroke();
    doc.y = y + rowH;
  }
  doc.moveDown(0.5);
}

function temperatureChart(doc, logs) {
  const points = (logs || [])
    .map(l => ({ label: l.time_label, value: Number(l.temperature_c) }))
    .filter(p => Number.isFinite(p.value));

  if (points.length < 2) {
    doc.font('vn').fontSize(10).fillColor('#7a7266')
      .text('Không đủ dữ liệu (cần ít nhất 2 lần đo) để vẽ biểu đồ nhiệt độ.');
    doc.fillColor('#1d1b18');
    doc.moveDown(0.5);
    return;
  }

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const chartH = 150;
  const padLeft = 34; // chỗ cho nhãn trục Y
  const padBottom = 20; // chỗ cho nhãn trục X
  const plotW = usable - padLeft;
  const plotH = chartH - padBottom;

  ensureSpace(doc, chartH + 30);
  const top = doc.y;
  const plotLeft = left + padLeft;
  const plotBottom = top + plotH;

  const values = points.map(p => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;

  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const xAt = i => plotLeft + i * xStep;
  const yAt = v => plotBottom - ((v - min) / (max - min)) * plotH;

  // Gridlines ngang + nhãn trục Y (3 mức: min, giữa, max)
  const gridVals = [min + pad, (min + max) / 2, max - pad];
  doc.font('vn').fontSize(7.5).fillColor('#a39c8f');
  gridVals.forEach(v => {
    const y = yAt(v);
    doc.moveTo(plotLeft, y).lineTo(plotLeft + plotW, y).strokeColor('#eee7da').lineWidth(0.5).stroke();
    doc.text(`${Math.round(v)}°C`, left, y - 4, { width: padLeft - 6, align: 'right' });
  });

  // Trục dọc/ngang chính
  doc.moveTo(plotLeft, top).lineTo(plotLeft, plotBottom).strokeColor('#c9bfae').lineWidth(0.8).stroke();
  doc.moveTo(plotLeft, plotBottom).lineTo(plotLeft + plotW, plotBottom).strokeColor('#c9bfae').lineWidth(0.8).stroke();

  // Đường nối các điểm đo
  doc.strokeColor('#b5622c').lineWidth(1.5);
  points.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.value);
    if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
  });
  doc.stroke();

  // Chấm tròn + nhãn giá trị + nhãn thời gian từng điểm
  points.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.value);
    doc.circle(x, y, 2.4).fillColor('#b5622c').fill();
    doc.font('vn').fontSize(7.5).fillColor('#1d1b18')
      .text(`${p.value}°C`, x - 16, y - 14, { width: 32, align: 'center' });
    doc.font('vn').fontSize(7.5).fillColor('#7a7266')
      .text(String(p.label ?? ''), x - 20, plotBottom + 4, { width: 40, align: 'center' });
  });

  doc.fillColor('#1d1b18');
  doc.x = plotLeft;
  doc.y = plotBottom + padBottom + 6;
}

async function photoGrid(doc, photos) {
  if (!photos.length) {
    doc.font('vn').fontSize(10).fillColor('#7a7266').text('Chưa có ảnh minh chứng.');
    doc.fillColor('#1d1b18');
    return;
  }

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---- Cấu hình grid ----
  const MAX_PER_ROW = 5;                                  // tối đa 5 ảnh / hàng
  const perRow = Math.min(MAX_PER_ROW, photos.length);    // nếu <5 ảnh thì giãn cho đẹp
  const gap = 6;                                          // khoảng cách giữa các ô (pt)
  const cellW = (usable - gap * (perRow - 1)) / perRow;   // bề rộng ô
  const cellImgH = cellW * 0.75;                          // tỉ lệ ảnh 4:3
  const labelH = 13;                                      // dòng "Ảnh N"
  //const cellH = cellImgH + labelH;
  const cellH = cellImgH; 

  const innerPad = 3;                                     // padding ảnh trong ô

  for (let i = 0; i < photos.length; i += perRow) {
    ensureSpace(doc, cellH + 8);
    const y = doc.y;
    const rowPhotos = photos.slice(i, i + perRow);

    for (let idx = 0; idx < rowPhotos.length; idx++) {
      const photo = rowPhotos[idx];
      const x = left + idx * (cellW + gap);

      // Khung ô
      doc.rect(x, y, cellW, cellH).strokeColor('#e5ded2').lineWidth(0.6).stroke();

      // Ảnh
      try {
        const buffer = await fetchImageBuffer(photo);
        doc.image(buffer, x + innerPad, y + innerPad, {
          fit: [cellW - innerPad * 2, cellImgH - innerPad * 2],
          align: 'center',
          valign: 'center'
        });
      } catch (_e) {
        doc.font('vn').fontSize(7).fillColor('#b3261e')
          .text('Lỗi ảnh', x + innerPad, y + cellImgH / 2, { width: cellW - innerPad * 2, align: 'center' });
        doc.fillColor('#1d1b18');
      }

      // Nhãn "Ảnh N"
     // doc.font('vn').fontSize(7.5).fillColor('#7a7266')
     //   .text(`Ảnh ${photo.slot}`, x + innerPad, y + cellImgH + 1, { width: cellW - innerPad * 2, align: 'center' });
   //   doc.fillColor('#1d1b18');
    }

    doc.y = y + cellH + 8;
  }
}
async function generateBurnTestReportPdf(res, test) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.registerFont('vn', FONT_REGULAR);
  doc.registerFont('vn-bold', FONT_BOLD);
  doc.registerFont('cjk', FONT_CJK);
  doc.registerFont('cjk-bold', FONT_CJK_BOLD);
  doc.pipe(res);

  // ---- Header theo cấu hình Cài đặt ----
  const brand = getBrand();
  // Header cân đối: logo neo trái; thông tin thương hiệu và tiêu đề căn giữa theo toàn trang.
  const headerTop = doc.y;
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageWidth = pageRight - pageLeft;
  if (brand.logo) { try { doc.image(brand.logo, pageLeft, headerTop, { fit: [82, 50] }); } catch (_) {} }
  let brandY = headerTop + 3;
  if (brand.company) {
    drawMixedText(doc, brand.company, pageLeft, brandY, { width: pageWidth, bold: true, fontSize: 13, align: 'center' });
    brandY += 18;
  }
  if (brand.factory) {
    drawMixedText(doc, brand.factory, pageLeft, brandY, { width: pageWidth, fontSize: 9.5, align: 'center' });
    brandY += 15;
  }
  if (brand.address) {
    drawMixedText(doc, brand.address, pageLeft, brandY, { width: pageWidth, fontSize: 8, align: 'center' });
    brandY += 13;
  }
  doc.y = Math.max(headerTop + (brand.logo ? 62 : 5), brandY + 2);
  doc.font('vn-bold').fontSize(18).fillColor('#1d1b18')
    .text(brand.title || 'BÁO CÁO TEST ĐỐT', pageLeft, doc.y, { width: pageWidth, align: 'center' });
  doc.font('vn').fontSize(9.5).fillColor('#7a7266')
    .text(`Xuất lúc: ${fmtDateTime(new Date().toISOString())}`, pageLeft, doc.y + 2, { width: pageWidth, align: 'center' });
  doc.fillColor('#1d1b18');
  doc.moveDown(0.8);

  // Mã hàng lớn + kết quả
  doc.fontSize(15).fillColor('#1d1b18');
  drawMixedText(doc, test.Product_Code || '—', doc.page.margins.left, doc.y, { bold: true });
  const resultKey = test.result || 'PENDING';
  const resultLabel = RESULT_LABEL[resultKey] || resultKey;
  doc.font('vn-bold').fontSize(12).fillColor(RESULT_COLOR[resultKey] || '#1d1b18')
    .text(resultLabel, doc.page.width - doc.page.margins.right - 160, doc.y - 17, { width: 160, align: 'right' });
  doc.fillColor('#1d1b18');
  doc.moveDown(0.6);

  // ---- Thông tin chung ----
  sectionTitle(doc, 'Thông tin chung');
  keyValueGrid(doc, [
    ['PO', fmtVal(test.po_number)],
    ['Khách hàng', fmtVal(test.customer_name)],
    ['Đường kính (mm)', fmtVal(test.Diameter)],
    ['Chiều cao (mm)', fmtVal(test.Height)],
    ['Hương liệu', fmtVal(test.Frag)],
    ['Màu', fmtVal(test.Color)],
    ['Bấc', fmtVal(test.Wick)],
    ['Nhiệt độ (°C)', fmtVal(test.Temperature)],
   // ['Ngày test', fmtVal(test.Test_date)],
    ['Bắt đầu', fmtDateTime(test.Start)],
    ['Kết thúc', fmtDateTime(test.End)],
    ['Tổng thời gian đốt', fmtVal(test.Total_Burn_Time)],
    ['Người test', fmtVal(test.Tester)],
    ['Người duyệt', fmtVal(test.Approved)]
  ]);

  if (test.note) {
    doc.font('vn').fontSize(9.5).fillColor('#7a7266').text('Ghi chú', doc.page.margins.left, doc.y, { width: 118 });
    doc.fontSize(10.5).fillColor('#1d1b18');
    drawMixedText(doc, String(test.note), doc.page.margins.left + 118, doc.y - doc.currentLineHeight(), { width: 350 });
    doc.moveDown(0.5);
  }
  doc.moveDown(0.4);

  // ---- Log kiểm tra định kỳ ----
  sectionTitle(doc, 'Log kiểm tra định kỳ');
  logTable(doc, test.logs || []);

  // ---- Biểu đồ nhiệt độ theo thời gian ----
  sectionTitle(doc, 'Biểu đồ nhiệt độ theo thời gian');
  temperatureChart(doc, test.logs || []);

  // ---- Ảnh minh chứng ----
  sectionTitle(doc, 'Ảnh minh chứng');
  await photoGrid(doc, test.photos || []);

  // ---- Số trang ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // cho phép vẽ trong vùng lề dưới mà không tự tạo trang mới
    doc.font('vn').fontSize(8).fillColor('#a39c8f')
      .text(`${brand.footer ? brand.footer + '  •  ' : ''}Trang ${i + 1}/${range.count}`, 0, doc.page.height - 30, { align: 'center', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

module.exports = { generateBurnTestReportPdf };
