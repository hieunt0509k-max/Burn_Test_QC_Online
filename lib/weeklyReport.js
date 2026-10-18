const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const path = require('path');
const { getBrand } = require('./reportBrand');

const fs = require('fs');
const FONT_REGULAR = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
if (!fs.existsSync(FONT_REGULAR) || !fs.existsSync(FONT_BOLD)) {
  throw new Error('Thiếu font DejaVuSans cho báo cáo PDF. Vui lòng kiểm tra thư mục assets/fonts.');
}

function parseDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return String(s || '—');
  return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtShort(s) {
  const d = parseDate(s);
  if (!d) return String(s || '—');
  return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
}
function fmtPct(v) { return `${Number(v || 0).toFixed(1).replace('.', ',')}%`; }

function normalizeRows(rows, fromDate, toDate) {
  const map = new Map();
  const start = parseDate(fromDate), end = parseDate(toDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    map.set(key, { date:key, total:0, pass:0, fail:0, pending:0 });
  }
  for (const r of rows) {
    const key = String(r.test_date || '').slice(0,10);
    if (!map.has(key)) continue;
    const x = map.get(key);
    x.total++;
    if (r.result === 'PASS') x.pass++;
    else if (r.result === 'FAIL') x.fail++;
    else x.pending++;
  }
  return [...map.values()];
}

function drawWeeklyChart(doc, daily) {
  const left = doc.page.margins.left, usable = doc.page.width - left - doc.page.margins.right;
  const top = doc.y, chartH = 205, bottom = top + chartH - 34;
  const padLeft = 34, plotW = usable - padLeft, plotH = chartH - 50;
  const max = Math.max(1, ...daily.flatMap(x => [Number(x.pass)||0, Number(x.fail)||0, Number(x.pending)||0]));
  const y = v => bottom - (v / max) * plotH;
  const groupW = plotW / Math.max(1, daily.length);
  const barW = Math.min(14, groupW * 0.16);
  const gap = Math.min(4, groupW * 0.035);
  const totalW = barW * 3 + gap * 2;

  doc.font('vn').fontSize(7).fillColor('#7a7266');
  [0, Math.ceil(max/2), max].forEach(v => {
    const yy = y(v);
    doc.moveTo(left + padLeft, yy).lineTo(left + padLeft + plotW, yy)
      .strokeColor('#eee7da').lineWidth(0.5).stroke();
    doc.text(String(v), left, yy-4, { width:padLeft-6, align:'right' });
  });

  daily.forEach((x,i) => {
    const gx = left + padLeft + i*groupW + (groupW-totalW)/2;
    const vals = [
      {v:Number(x.pass)||0, fill:'#1f7a3f'},
      {v:Number(x.fail)||0, fill:'#b3261e'},
      {v:Number(x.pending)||0, fill:'#d69e18'}
    ];
    vals.forEach((seg,j) => {
      if (!seg.v) return;
      const h = (seg.v/max)*plotH;
      const bx = gx + j*(barW+gap);
      doc.rect(bx, bottom-h, barW, h).fill(seg.fill);
      doc.font('vn-bold').fontSize(6.5).fillColor('#1d1b18')
        .text(String(seg.v), bx-2, bottom-h-9, {width:barW+4, align:'center'});
    });
    doc.font('vn').fontSize(6.5).fillColor('#7a7266')
      .text(fmtShort(x.date), gx-8, bottom+5, {width:totalW+16, align:'center'});
  });

  const legendY = top + chartH - 7;
  const legend = [
    ['#1f7a3f','PASS'], ['#b3261e','FAIL'], ['#d69e18','PENDING']
  ];
  let lx = left + padLeft;
  legend.forEach(([fill,label]) => {
    doc.rect(lx, legendY, 7, 7).fill(fill);
    doc.font('vn').fontSize(7).fillColor('#7a7266').text(label, lx+10, legendY-1, {width:55});
    lx += 65;
  });
  doc.fillColor('#1d1b18');
  doc.y = top + chartH + 4;
}

async function buildWeeklyChartImage(daily) {
  const W=1000,H=390,padL=60,padR=30,padT=28,padB=70;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const max=Math.max(1,...daily.flatMap(x=>[Number(x.pass)||0,Number(x.fail)||0,Number(x.pending)||0]));
  const y=v=>padT+plotH-(v/max)*plotH;
  const groupW=plotW/Math.max(1,daily.length);
  const barW=Math.min(24,groupW*.15), gap=Math.min(7,groupW*.035), totalW=barW*3+gap*2;
  const lines=[0,Math.ceil(max/2),max].map(v=>`<line x1="${padL}" y1="${y(v)}" x2="${W-padR}" y2="${y(v)}" stroke="#eee7da"/><text x="${padL-8}" y="${y(v)+4}" text-anchor="end" font-size="14" fill="#7a7266">${v}</text>`).join('');
  const bars=daily.map((x,i)=>{
    const gx=padL+i*groupW+(groupW-totalW)/2;
    const vals=[[x.pass,'#1f7a3f'],[x.fail,'#b3261e'],[x.pending,'#d69e18']];
    const parts=[];
    vals.forEach(([v,fill],j)=>{
      v=Number(v)||0; if(!v) return;
      const h=(v/max)*plotH, bx=gx+j*(barW+gap);
      parts.push(`<rect x="${bx}" y="${y(v)}" width="${barW}" height="${h}" rx="2" fill="${fill}"/>`);
      parts.push(`<text x="${bx+barW/2}" y="${y(v)-7}" text-anchor="middle" font-size="12" font-weight="700" fill="#1d1b18">${v}</text>`);
    });
    return parts.join('')+`<text x="${gx+totalW/2}" y="${H-padB+24}" text-anchor="middle" font-size="13" fill="#7a7266">${fmtShort(x.date)}</text>`;
  }).join('');
  const legend=[['#1f7a3f','PASS'],['#b3261e','FAIL'],['#d69e18','PENDING']];
  let lx=padL;
  const legendSvg=legend.map(([fill,label])=>{const out=`<rect x="${lx}" y="${H-28}" width="12" height="12" rx="2" fill="${fill}"/><text x="${lx+17}" y="${H-18}" font-size="13" fill="#58636d">${label}</text>`;lx+=105;return out;}).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="white"/>${lines}
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="#c9bfae"/>
  <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="#c9bfae"/>
  ${bars}${legendSvg}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateWeeklyReportPdf(res, report) {
  const doc = new PDFDocument({size:'A4',margin:40});
  doc.registerFont('vn',FONT_REGULAR); doc.registerFont('vn-bold',FONT_BOLD); doc.pipe(res);
  const {from_date,to_date,daily,total,pass_count,fail_count,pending_count,pass_rate}=report;
  const brand = getBrand();
  // Header cân đối: logo neo trái, nhưng tên công ty / nhà máy được căn giữa toàn trang.
  // Tiêu đề và khoảng ngày cũng dùng cùng trục giữa để tránh cảm giác lệch khi logo có kích thước khác nhau.
  const top = doc.y;
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageCenter = doc.page.width / 2;
  if (brand.logo) { try { doc.image(brand.logo, pageLeft, top, { fit:[82,48] }); } catch (_) {} }
  let headerY = top + 3;
  if (brand.company) {
    doc.font('vn-bold').fontSize(12).fillColor('#1d1b18')
      .text(brand.company, pageLeft, headerY, { width: pageRight - pageLeft, align:'center' });
    headerY += 17;
  }
  if (brand.factory) {
    doc.font('vn').fontSize(8.5).fillColor('#7a7266')
      .text(brand.factory, pageLeft, headerY, { width: pageRight - pageLeft, align:'center' });
    headerY += 14;
  }
  if (brand.address) {
    doc.font('vn').fontSize(7.5).fillColor('#8a8175')
      .text(brand.address, pageLeft, headerY, { width: pageRight - pageLeft, align:'center' });
    headerY += 12;
  }
  doc.y = Math.max(top + (brand.logo ? 58 : 10), headerY + 2);
  doc.font('vn-bold').fontSize(20).fillColor('#1d1b18')
    .text(brand.title || 'BÁO CÁO TỔNG HỢP TEST ĐỐT', pageLeft, doc.y, { width: pageRight - pageLeft, align:'center' });
  doc.font('vn').fontSize(10).fillColor('#7a7266')
    .text(`Tuần: ${fmtDate(from_date)} - ${fmtDate(to_date)}`, pageLeft, doc.y + 2, { width: pageRight - pageLeft, align:'center' });
  doc.moveDown(1);
  const cards=[
    ['TỔNG MẪU TEST',total,'#1d1b18'],
    ['ĐẠT',pass_count,'#1f7a3f'],
    ['KHÔNG ĐẠT',fail_count,'#b3261e'],
    ['TỶ LỆ ĐẠT',fmtPct(pass_rate),'#b5622c']
  ];
  const gap=10, cw=(doc.page.width-80-gap*3)/4, y0=doc.y;
  cards.forEach((c,i)=>{
    const x=40+i*(cw+gap);
    doc.rect(x,y0,cw,58).fill('#f2ede4');
    doc.font('vn-bold').fontSize(8).fillColor('#7a7266').text(c[0],x+7,y0+8,{width:cw-14,align:'center'});
    doc.font('vn-bold').fontSize(17).fillColor(c[2]).text(String(c[1]),x+7,y0+25,{width:cw-14,align:'center'});
  });
  doc.y=y0+78;
  doc.font('vn-bold').fontSize(12).fillColor('#b5622c').text('BIỂU ĐỒ TEST THEO NGÀY');
  doc.moveDown(.3); drawWeeklyChart(doc,daily);
  doc.moveDown(1);
  doc.font('vn-bold').fontSize(12).fillColor('#b5622c').text('CHI TIẾT TỪNG NGÀY');
  doc.moveDown(.4);
  const left=40, usable=doc.page.width-80, widths=[110,90,90,100,90];
  const heads=['Ngày','Tổng mẫu','Đạt','Không đạt','Pending'];
  const rowH=22;
  let y=doc.y;
  doc.rect(left,y,usable,rowH).fill('#f2ede4');
  let x=left;
  heads.forEach((h,i)=>{doc.font('vn-bold').fontSize(8.5).fillColor('#7a7266').text(h,x+4,y+7,{width:widths[i]-8,align:i?'right':'left'});x+=widths[i];});
  y+=rowH;
  daily.forEach(r=>{
    if(y>750){doc.addPage();y=40;}
    x=left;
    const vals=[fmtDate(r.date),r.total,r.pass,r.fail,r.pending];
    vals.forEach((v,i)=>{doc.font('vn').fontSize(9).fillColor('#1d1b18').text(String(v),x+4,y+7,{width:widths[i]-8,align:i?'right':'left'});x+=widths[i];});
    doc.moveTo(left,y+rowH).lineTo(left+usable,y+rowH).strokeColor('#e5ded2').stroke(); y+=rowH;
  });
  doc.font('vn').fontSize(8).fillColor('#a39c8f').text(`${brand.footer ? brand.footer + '  •  ' : ''}Xuất lúc: ${new Date().toLocaleString('vi-VN',{hour12:false})}`,40,doc.page.height-32,{align:'center'});
  doc.end();
}

async function generateWeeklyReportXlsx(res, report) {
  const wb=new ExcelJS.Workbook(); wb.creator='QC Burn Test'; wb.created=new Date();
  const brand = getBrand();
  const s=wb.addWorksheet('Báo cáo tuần');
  if (brand.logo) { try { const id=wb.addImage({buffer:fs.readFileSync(brand.logo), extension:(path.extname(brand.logo).slice(1).toLowerCase()==='jpg'?'jpeg':path.extname(brand.logo).slice(1).toLowerCase())}); s.addImage(id,{tl:{col:0,row:0},ext:{width:90,height:50}}); } catch(_){} }
  s.columns=[{width:18},{width:16},{width:14},{width:16},{width:14},{width:18}];
  s.mergeCells('A1:F1'); s.getCell('A1').value=brand.title || 'BÁO CÁO TỔNG HỢP TEST ĐỐT';
  s.getCell('A1').font={bold:true,size:18}; s.getCell('A1').alignment={horizontal:'center'};
  s.mergeCells('A2:F2'); if(brand.company) { s.mergeCells('A3:F3'); s.getCell('A3').value=brand.company + (brand.factory ? ' — '+brand.factory : ''); s.getCell('A3').alignment={horizontal:'center'}; s.getCell('A3').font={bold:true}; } s.getCell('A2').value=`Tuần: ${fmtDate(report.from_date)} - ${fmtDate(report.to_date)}`;
  s.getCell('A2').alignment={horizontal:'center'};
  const metrics=[['Tổng mẫu test',report.total],['Tổng đạt',report.pass_count],['Tổng không đạt',report.fail_count],['Pending',report.pending_count],['Tỷ lệ đạt',report.pass_rate/100]];
  metrics.forEach((m,i)=>{const c=s.getCell(4,i+1);c.value=m[0];c.font={bold:true};s.getCell(5,i+1).value=m[1];s.getCell(5,i+1).font={bold:true,size:14};});
  s.getCell(5,5).numFmt='0.0%';
  s.getCell(7,1).value='Ngày'; s.getCell(7,2).value='Tổng mẫu'; s.getCell(7,3).value='Đạt'; s.getCell(7,4).value='Không đạt'; s.getCell(7,5).value='Pending';
  s.getRow(7).font={bold:true};
  report.daily.forEach((r,i)=>{const row=8+i;s.getCell(row,1).value=new Date(`${r.date}T00:00:00`);s.getCell(row,1).numFmt='dd/mm/yyyy';s.getCell(row,2).value=r.total;s.getCell(row,3).value=r.pass;s.getCell(row,4).value=r.fail;s.getCell(row,5).value=r.pending;});
  const img=await buildWeeklyChartImage(report.daily);
  const imgId=wb.addImage({buffer:img,extension:'png'});
  s.addImage(imgId,{tl:{col:0,row:16},ext:{width:760,height:274}});
  s.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  s.getColumn(1).width=18;
  await wb.xlsx.write(res);
}
module.exports={generateWeeklyReportPdf,generateWeeklyReportXlsx};
