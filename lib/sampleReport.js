const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const sharp = require('sharp');
const { prepare, UPLOADS_DIR } = require('../database/database');

function getData(id) {
  const r = prepare(`SELECT s.*, c.name customer_name, po.po_number
    FROM sample_burn_tests s
    LEFT JOIN customers c ON c.id=s.customer_id
    LEFT JOIN purchase_orders po ON po.id=s.purchase_order_id
    WHERE s.id=?`).get(id);
  if (!r) throw new Error('Không tìm thấy test hàng mẫu');
  r.photos = prepare('SELECT * FROM sample_burn_test_photos WHERE sample_test_id=? ORDER BY slot').all(id);
  return r;
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function shell(cmd,args,opts={}) {
  cp.execFileSync(cmd,args,{stdio:'ignore',...opts});
}
function psQuote(v){ return String(v).replace(/'/g,"''"); }
function packDocx(dir,dst){
  if(process.platform==='win32'){
    const d=psQuote(dir), out=psQuote(dst);
    shell('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; if(Test-Path '${out}'){Remove-Item -LiteralPath '${out}' -Force}; [System.IO.Compression.ZipFile]::CreateFromDirectory('${d}','${out}',[System.IO.Compression.CompressionLevel]::Optimal,$false)`]);
  } else {
    shell('zip',['-q','-r',dst,'.'],{cwd:dir});
  }
}
function writeFile(p,s){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,s); }
function resolvePhotoPath(ph){
  const candidates=[
    path.join(UPLOADS_DIR,'sample-tests',String(ph.file_name||'')),
    path.resolve(String(ph.file_name||'')),
    ph.file_url ? path.join(UPLOADS_DIR,String(ph.file_url).replace(/^\/+/, '').replace(/^uploads[\\\/]/, '')) : ''
  ].filter(Boolean);
  return candidates.find(p=>fs.existsSync(p))||null;
}

const NS = {
  w:'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp:'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a:'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic:'http://schemas.openxmlformats.org/drawingml/2006/picture'
};
function textRun(text,bold=false,size=22){
  return `<w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function paragraph(content='',align='left',after=80){
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:after="${after}"/></w:pPr>${content}</w:p>`;
}
function imageDrawing(rid,cx,cy,id){
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${1000+id}" name="Photo ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${1000+id}" name="Photo ${id}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
function photoCell(photo,rid,size,index){
  const inner = photo
    ? paragraph(imageDrawing(rid,size.cx,size.cy,index),'center',0)
    : paragraph('', 'center', 0);
  return `<w:tc><w:tcPr><w:tcW w:w="3480" w:type="dxa"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
}
function photoRow(items){
  return `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="3000" w:hRule="atLeast"/></w:trPr><w:tblPrEx/>${items.map(x=>photoCell(x.photo,x.rid,x.size,x.index)).join('')}</w:tr>`;
}
async function getFit(src){
  try {
    const m=await sharp(src).metadata();
    const pxW=Math.max(1,Number(m.width)||1), pxH=Math.max(1,Number(m.height)||1);
    // Word DrawingML uses EMU, not pixels. 96 DPI => 9525 EMU / pixel.
    // Keep the image inside the wide report cell and preserve its aspect ratio.
    const EMU_PER_PX=9525;
    const maxW=2050000, maxH=1780000;
    const w=pxW*EMU_PER_PX, h=pxH*EMU_PER_PX;
    const scale=Math.min(maxW/w,maxH/h,1);
    return {cx:Math.max(9525,Math.round(w*scale)),cy:Math.max(9525,Math.round(h*scale))};
  } catch { return {cx:1800000,cy:1400000}; }
}
function makeDocument(info, rows){
  const headerCells = [
    ['Đơn hàng', info.po_number || ''],
    ['Quy cách', info.product_name || info.size || ''],
    ['Bấc', info.wick_spec || '']
  ].map(x => `<w:tc><w:tcPr><w:tcW w:w="3480" w:type="dxa"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${paragraph(textRun(x[0]+': ',true,20)+textRun(x[1],false,20),'center',0)}</w:tc>`).join('');
  const table = `<w:tbl><w:tblPr><w:tblW w:w="10440" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="AEB7BF"/><w:left w:val="single" w:sz="8" w:color="AEB7BF"/><w:bottom w:val="single" w:sz="8" w:color="AEB7BF"/><w:right w:val="single" w:sz="8" w:color="AEB7BF"/><w:insideH w:val="single" w:sz="6" w:color="D5DADF"/><w:insideV w:val="single" w:sz="6" w:color="D5DADF"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3480"/><w:gridCol w:w="3480"/><w:gridCol w:w="3480"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="650" w:hRule="atLeast"/></w:trPr>${headerCells}</w:tr>${rows.join('')}</w:tbl>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"><w:body>${table}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="500" w:right="480" w:bottom="500" w:left="480"/></w:sectPr></w:body></w:document>`;
}
async function buildSampleReport(id){
  const d=getData(id);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'burn-sample-native-'));
  const out=path.join(os.tmpdir(),`sample-report-${id}-${Date.now()}.docx`);
  try{
    writeFile(path.join(tmp,'[Content_Types].xml'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`);
    writeFile(path.join(tmp,'_rels','.rels'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    writeFile(path.join(tmp,'word','styles.xml'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
    writeFile(path.join(tmp,'word','settings.xml'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${NS.w}"><w:zoom w:percent="100"/></w:settings>`);

    const rels=[]; const rows=[]; const photos=(d.photos||[]).sort((a,b)=>Number(a.slot)-Number(b.slot));
    let rid=10;
    for(let i=0;i<photos.length;i+=3){
      const items=[];
      for(let j=0;j<3;j++){
        const ph=photos[i+j];
        if(ph){
          const src=resolvePhotoPath(ph);
          const target=path.join(tmp,'word','media',`image-${i+j+1}.jpg`);
          let ok=false;
          if(fs.existsSync(src)){ fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(src,target); ok=true; }
          const rr=`rId${rid++}`;
          if(ok) rels.push(`<Relationship Id="${rr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image-${i+j+1}.jpg"/>`);
          items.push({photo:ok?ph:null,rid:rr,size:ok?await getFit(src):{cx:1,cy:1},index:i+j+1});
        } else items.push({photo:null,rid:null,size:{cx:1,cy:1},index:i+j+1});
      }
      rows.push(photoRow(items));
    }
    writeFile(path.join(tmp,'word','_rels','document.xml.rels'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    writeFile(path.join(tmp,'word','document.xml'),makeDocument(d,rows));
    packDocx(tmp,out);
    return fs.readFileSync(out);
  } finally {
    try{fs.rmSync(tmp,{recursive:true,force:true});fs.unlinkSync(out);}catch{}
  }
}
module.exports={buildSampleReport};
