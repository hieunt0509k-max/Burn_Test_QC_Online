const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { prepare, transaction, UPLOADS_DIR } = require('../database/database');
const router = express.Router();

const clean = v => v == null ? '' : String(v).trim();
const sampleDir = path.join(UPLOADS_DIR, 'sample-tests');
fs.mkdirSync(sampleDir, { recursive: true });
function safeFolderPart(v, fallback='NA') {
  const x=clean(v).normalize('NFKC').replace(/[<>:"/\\|?*]+/g,'_').replace(/[\s]+/g,' ').trim().replace(/[. ]+$/g,'');
  return x.slice(0,100) || fallback;
}
function samplePhotoFolder(test) {
  const po=safeFolderPart(test?.po_number,'PO');
  const spec=safeFolderPart(test?.product_name || test?.size,'Quy_cach');
  const wick=safeFolderPart(test?.wick_spec,'Bac');
  const dir=path.join(sampleDir, po, `${spec}_${wick}`);
  fs.mkdirSync(dir,{recursive:true});
  return dir;
}
function relativeSampleFile(folder, filename) { return path.relative(sampleDir, path.join(folder, filename)).split(path.sep).join('/'); }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, sampleDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 }, fileFilter: (_req,file,cb)=>{
  cb(null, /^image\/(jpeg|png|webp|jpg)$/i.test(file.mimetype));
}});

function getOne(id){
  const r=prepare(`SELECT s.*, c.name customer_name, po.po_number FROM sample_burn_tests s
    LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN purchase_orders po ON po.id=s.purchase_order_id WHERE s.id=?`).get(id);
  if(r){
    r.photos=prepare('SELECT * FROM sample_burn_test_photos WHERE sample_test_id=? ORDER BY slot').all(id);
    r.cycles=prepare('SELECT * FROM sample_burn_cycles WHERE sample_test_id=? ORDER BY cycle_no, id').all(id);
  }
  return r;
}

function parseDurationToSeconds(value){
  if(value == null || value === '') return 0;
  if(typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value).trim();
  if(!text) return 0;
  const normalized = text.replace(/,/g, '.').replace(/\s*giờ\s*/gi, ':').replace(/\s*phút\s*/gi, ':').replace(/\s*giây\s*/gi, '');
  const parts = normalized.split(':').map(p => Number(p));
  if(parts.length === 3 && parts.every(n => Number.isFinite(n))) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  if(parts.length === 2 && parts.every(n => Number.isFinite(n))) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60);
  }
  const asNumber = Number(normalized.replace(/[^\d.]/g, ''));
  if(Number.isFinite(asNumber)) return Math.max(0, Math.round(asNumber));
  return 0;
}

function normalizeSampleCycles(raw){
  const list=Array.isArray(raw) ? raw : [];
  return list.map((item,index)=>{
    const phase=String(item?.phase || item?.type || 'BURN').toUpperCase();
    if(phase !== 'BURN') return null;
    const cycleNo = Number(item?.cycle_no ?? item?.cycleNo ?? item?.cycle ?? (index + 1));
    const startAt = clean(item?.start_at ?? item?.startAt ?? item?.started_at ?? new Date().toISOString());
    const endAt = clean(item?.end_at ?? item?.endAt ?? item?.ended_at ?? startAt);
    const durationSeconds = Number(item?.duration_seconds ?? item?.durationSeconds ?? 0);
    return {
      cycle_no: Number.isFinite(cycleNo) ? cycleNo : index + 1,
      phase: 'BURN',
      start_at: startAt || new Date().toISOString(),
      end_at: endAt || startAt || new Date().toISOString(),
      duration_seconds: Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : 0
    };
  }).filter(Boolean);
}

function saveSampleCycles(sampleTestId, rawCycles){
  const cycles = normalizeSampleCycles(rawCycles);
  prepare('DELETE FROM sample_burn_cycles WHERE sample_test_id=?').run(sampleTestId);
  if(!cycles.length){
    const start = clean(rawCycles?.[0]?.start_at ?? rawCycles?.[0]?.startAt ?? null);
    const end = clean(rawCycles?.[0]?.end_at ?? rawCycles?.[0]?.endAt ?? null);
    const duration = Number(rawCycles?.[0]?.duration_seconds ?? rawCycles?.[0]?.durationSeconds ?? 0);
    if(start || end || duration){
      const fallback = [{ cycle_no: 1, phase: 'BURN', start_at: start || new Date().toISOString(), end_at: end || start || new Date().toISOString(), duration_seconds: Math.max(0, Math.round(duration || 0)) }];
      fallback.forEach(c => prepare(`INSERT INTO sample_burn_cycles(sample_test_id, cycle_no, phase, start_at, end_at, duration_seconds) VALUES(?,?,?,?,?,?)`).run(sampleTestId, c.cycle_no, c.phase, c.start_at, c.end_at, c.duration_seconds));
    }
    return;
  }
  cycles.forEach(c => prepare(`INSERT INTO sample_burn_cycles(sample_test_id, cycle_no, phase, start_at, end_at, duration_seconds) VALUES(?,?,?,?,?,?)`).run(sampleTestId, c.cycle_no, c.phase, c.start_at, c.end_at, c.duration_seconds));
}
function applySampleTimerState(id, data){
  const sampleId = Number(id);
  if(!sampleId) return;
  const current = getOne(sampleId);
  if(!current) return;
  const isRunning = Number(data?.is_running ?? data?.running ?? current.is_running ?? 0) === 1;
  const currentPhase = String(data?.current_phase || data?.phase || current.current_phase || 'BURN').toUpperCase();
  const phaseStartedAt = isRunning
    ? clean(data?.phase_started_at || data?.phaseStartedAt || current.phase_started_at || new Date().toISOString())
    : null;
  const phaseElapsedSeconds = Number.isFinite(Number(data?.phase_elapsed_seconds ?? data?.phaseElapsedSeconds))
    ? Math.max(0, Number(data.phase_elapsed_seconds ?? data.phaseElapsedSeconds))
    : Math.max(0, Number(current.phase_elapsed_seconds || 0));
  const totalBurnSeconds = Number.isFinite(Number(data?.total_burn_seconds ?? data?.totalBurnSeconds))
    ? Number(data.total_burn_seconds ?? data.totalBurnSeconds)
    : parseDurationToSeconds(data?.total_burn_time ?? current.total_burn_time ?? current.burn_total_seconds ?? 0);
  prepare(`UPDATE sample_burn_tests SET
    is_running=?, current_phase=?, phase_started_at=?, phase_elapsed_seconds=?, burn_total_seconds=?, total_burn_time=?, last_saved_at=datetime('now')
    WHERE id=?`).run(
      isRunning ? 1 : 0,
      ['BURN','REST'].includes(currentPhase) ? currentPhase : 'BURN',
      phaseStartedAt || null,
      Math.round(phaseElapsedSeconds),
      Number.isFinite(totalBurnSeconds) ? Math.max(0, totalBurnSeconds) : 0,
      clean(data?.total_burn_time ?? current.total_burn_time ?? (Number.isFinite(totalBurnSeconds) ? (() => {
        const h = Math.floor(totalBurnSeconds / 3600);
        const m = Math.floor((totalBurnSeconds % 3600) / 60);
        const s = totalBurnSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      })() : null)) || null,
      sampleId
    );
}
router.get('/refs',(req,res,next)=>{try{
  const customers=prepare('SELECT id, name FROM customers ORDER BY name').all();
  const purchase_orders=prepare(`SELECT po.id, po.customer_id, po.po_number, c.name AS customer_name
    FROM purchase_orders po JOIN customers c ON c.id=po.customer_id ORDER BY po.po_number`).all();
  res.json({customers, purchase_orders});
}catch(e){next(e)}});
router.get('/',(req,res,next)=>{try{
  let sql=`SELECT s.*, c.name customer_name, po.po_number, (SELECT COUNT(*) FROM sample_burn_test_photos p WHERE p.sample_test_id=s.id) photo_count
    FROM sample_burn_tests s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN purchase_orders po ON po.id=s.purchase_order_id WHERE 1=1`;
  const p=[]; if(req.query.q){sql+=' AND (s.product_code LIKE ? OR s.product_name LIKE ? OR c.name LIKE ? OR po.po_number LIKE ?)'; const q='%'+req.query.q+'%'; p.push(q,q,q,q)}
  sql+=' ORDER BY s.test_date DESC, s.id DESC';
  const rows=prepare(sql).all(...p); res.json(rows);
}catch(e){next(e)}});

// ============================================================
// XUẤT BÁO CÁO EXCEL (.xlsx)
// ============================================================
router.get('/:id/report.xlsx', async (req, res, next) => {
  try {
    const { buildSampleReportXlsx } = require('../lib/sampleReportXlsx');
    const buf = await buildSampleReportXlsx(Number(req.params.id));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`test-hang-mau-${req.params.id}.xlsx`)}`);
    res.send(Buffer.from(buf));
  } catch (e) { next(e); }
});

router.get('/:id/cycles',(req,res,next)=>{try{const id=Number(req.params.id); if(!getOne(id)) return res.status(404).json({error:'Không tìm thấy test hàng mẫu'}); const cycles=prepare('SELECT * FROM sample_burn_cycles WHERE sample_test_id=? ORDER BY cycle_no, id').all(id); res.json(cycles);}catch(e){next(e)}});

// ============================================================
// IN TEM cho nhiều mã hàng test đốt (PDF / XLSX)
// ============================================================
router.post('/labels.pdf', async (req, res, next) => {
  try {
    const { generateSampleLabelsPdf } = require('../lib/sampleLabelReport');
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if(!ids.length) return res.status(400).json({ error: 'Chưa chọn mã hàng để in tem' });
    const hint = ids.length === 1 ? `InTem_TestDot_${ids[0]}` : `InTem_TestDot_${ids.length}ma`;
    await generateSampleLabelsPdf(res, ids, hint);
  } catch (e) { next(e); }
});
router.post('/labels.xlsx', async (req, res, next) => {
  try {
    const { generateSampleLabelsXlsx } = require('../lib/sampleLabelReportXlsx');
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if(!ids.length) return res.status(400).json({ error: 'Chưa chọn mã hàng để in tem' });
    const hint = ids.length === 1 ? `Tem_TestDot_${ids[0]}` : `Tem_TestDot_${ids.length}ma`;
    await generateSampleLabelsXlsx(res, ids, hint);
  } catch (e) { next(e); }
});
router.patch('/:id/timer',(req,res,next)=>{try{
  const id=Number(req.params.id);
  if(!getOne(id)) return res.status(404).json({error:'Không tìm thấy test hàng mẫu'});
  applySampleTimerState(id, req.body || {});
  res.json(getOne(id));
}catch(e){next(e)}});

// Ghi nhận 1 chu kỳ đốt đã hoàn tất, dừng timer và lưu vào database
router.post('/:id/cycles',(req,res,next)=>{try{
  const id=Number(req.params.id);
  if(!getOne(id)) return res.status(404).json({error:'Không tìm thấy test hàng mẫu'});
  const body = req.body || {};
  const cycles = normalizeSampleCycles([{ phase:'BURN', start_at: body.start_at, end_at: body.end_at, duration_seconds: body.duration_seconds }]);
  if(!cycles.length) return res.status(400).json({error:'Dữ liệu chu kỳ không hợp lệ'});
  const cycle = cycles[0];
  const existing = prepare('SELECT COUNT(*) AS c FROM sample_burn_cycles WHERE sample_test_id=?').get(id)?.c || 0;
  const cycleNo = Number.isFinite(Number(body.cycle_no)) ? Number(body.cycle_no) : existing + 1;
  const totalBurnSeconds = Number(body.total_burn_seconds);
  const phaseElapsed = Number(body.phase_elapsed_seconds);
  transaction(()=>{
    prepare(`INSERT INTO sample_burn_cycles(sample_test_id, cycle_no, phase, start_at, end_at, duration_seconds) VALUES(?,?,?,?,?,?)`)
      .run(id, cycleNo, cycle.phase, cycle.start_at, cycle.end_at, cycle.duration_seconds);
    prepare(`UPDATE sample_burn_tests SET
      is_running=0, current_phase='REST', phase_elapsed_seconds=?, burn_total_seconds=?, total_burn_time=?, end_datetime=?, last_saved_at=datetime('now')
      WHERE id=?`).run(
        Number.isFinite(phaseElapsed) ? Math.max(0, Math.round(phaseElapsed)) : 0,
        Number.isFinite(totalBurnSeconds) ? Math.max(0, Math.round(totalBurnSeconds)) : cycle.duration_seconds,
        (() => { const t = Number.isFinite(totalBurnSeconds) ? Math.max(0, Math.round(totalBurnSeconds)) : cycle.duration_seconds; const h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=t%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; })(),
        body.end_datetime || cycle.end_at || null,
        id
      );
  });
  res.status(201).json(getOne(id));
}catch(e){next(e)}});
router.get('/:id',(req,res,next)=>{try{const r=getOne(req.params.id); if(!r)return res.status(404).json({error:'Không tìm thấy test hàng mẫu'});res.json(r)}catch(e){next(e)}});
router.post('/',(req,res,next)=>{try{
  const product_code=clean(req.body.product_code)||'SAMPLE';
  const startDT = clean(req.body.start_datetime) || null;
  const id=transaction(()=>{
    const r=prepare(`INSERT INTO sample_burn_tests(
      customer_id, purchase_order_id, product_code, product_name, size, weight,
      wick_spec, test_date, tester, note,
      start_datetime, end_datetime, total_burn_time, test_result, approved
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        req.body.customer_id?Number(req.body.customer_id):null,
        req.body.purchase_order_id?Number(req.body.purchase_order_id):null,
        product_code,
        clean(req.body.product_name)||null,
        null, null,
        clean(req.body.wick_spec)||null,
        (startDT || new Date().toISOString()).slice(0,10),
        clean(req.body.tester)||null,
        null,
        startDT,
        clean(req.body.end_datetime)||null,
        clean(req.body.total_burn_time)||null,
        (clean(req.body.test_result)||'PENDING').toUpperCase(),
        clean(req.body.approved)||null
      );
    const sampleTestId = Number(r.lastInsertRowid);
    saveSampleCycles(sampleTestId, req.body.cycle_segments || req.body.cycles || []);
    return sampleTestId;
  });
  res.status(201).json(getOne(id));
}catch(e){res.status(400).json({error:e.message})}});

router.put('/:id',(req,res,next)=>{try{
  const id=Number(req.params.id);
  const existing = getOne(id);
  if(!existing) return res.status(404).json({error:'Không tìm thấy test hàng mẫu'});
  const product_code=clean(req.body.product_code)||'SAMPLE';
  const startDT = clean(req.body.start_datetime) || existing.start_datetime || null;
  prepare(`UPDATE sample_burn_tests SET
    customer_id=?, purchase_order_id=?, product_code=?, product_name=?, size=?, weight=?,
    wick_spec=?, test_date=?, tester=?, note=?,
    start_datetime=?, end_datetime=?, total_burn_time=?, test_result=?, approved=?,
    updated_at=datetime('now')
    WHERE id=?`).run(
      req.body.customer_id?Number(req.body.customer_id):null,
      req.body.purchase_order_id?Number(req.body.purchase_order_id):null,
      product_code,
      clean(req.body.product_name)||null,
      null, null,
      clean(req.body.wick_spec)||null,
      (startDT || existing.test_date || new Date().toISOString()).slice(0,10),
      clean(req.body.tester)||null,
      null,
      startDT,
      clean(req.body.end_datetime)||null,
      clean(req.body.total_burn_time)||null,
      (clean(req.body.test_result)||existing.test_result||'PENDING').toUpperCase(),
      clean(req.body.approved)||null,
      id
    );
  if (Object.prototype.hasOwnProperty.call(req.body, 'cycle_segments') || Object.prototype.hasOwnProperty.call(req.body, 'cycles')) {
    saveSampleCycles(id, req.body.cycle_segments || req.body.cycles || []);
  }
  res.json(getOne(id));
}catch(e){res.status(400).json({error:e.message})}});
router.post('/:id/photos',upload.single('photo'),async (req,res,next)=>{
  let uploadedPath=null, compressedPath=null;
  try{
    const id=Number(req.params.id);
    if(!getOne(id)) throw new Error('Không tìm thấy test hàng mẫu');
    if(!req.file) throw new Error('Chưa chọn ảnh');
    uploadedPath=req.file.path;

    const base=path.basename(req.file.filename,path.extname(req.file.filename));
    const test=getOne(id);
    const photoFolder=samplePhotoFolder(test);
    compressedPath=path.join(photoFolder,`${base}-compressed.jpg`);
    await sharp(uploadedPath,{failOn:'none'})
      .rotate()
      .resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:78,mozjpeg:true})
      .toFile(compressedPath);

    const stat=fs.statSync(compressedPath);
    const requestedSlot=Number(req.body.slot);
    let slot=Number.isInteger(requestedSlot)&&requestedSlot>0?requestedSlot:0;
    if(!slot){
      const used=prepare('SELECT slot FROM sample_burn_test_photos WHERE sample_test_id=? ORDER BY slot').all(id).map(x=>Number(x.slot)).filter(Number.isFinite);
      slot=1;
      const set=new Set(used);
      while(set.has(slot)) slot++;
    }
    const old=prepare('SELECT * FROM sample_burn_test_photos WHERE sample_test_id=? AND slot=?').get(id,slot);
    if(old){
      try{fs.unlinkSync(path.join(sampleDir,old.file_name))}catch(_e){}
      prepare('DELETE FROM sample_burn_test_photos WHERE sample_test_id=? AND slot=?').run(id,slot);
    }
    const storedName=relativeSampleFile(photoFolder,`${base}-compressed.jpg`);
    const fileUrl=`/uploads/sample-tests/${storedName}`;
    prepare(`INSERT INTO sample_burn_test_photos(sample_test_id,slot,file_name,file_url,original_name,mime_type,file_size) VALUES(?,?,?,?,?,?,?)`).run(id,slot,storedName, fileUrl,req.file.originalname,'image/jpeg',stat.size);
    try{if(uploadedPath!==compressedPath)fs.unlinkSync(uploadedPath)}catch(_e){}
    res.status(201).json(getOne(id));
  }catch(e){
    try{if(uploadedPath&&fs.existsSync(uploadedPath))fs.unlinkSync(uploadedPath)}catch(_e){}
    try{if(compressedPath&&fs.existsSync(compressedPath))fs.unlinkSync(compressedPath)}catch(_e){}
    res.status(400).json({error:e.message});
  }
});
router.delete('/:id/photos/:slot',(req,res,next)=>{try{const ph=prepare('SELECT * FROM sample_burn_test_photos WHERE sample_test_id=? AND slot=?').get(req.params.id,req.params.slot);if(!ph)return res.status(404).json({error:'Không tìm thấy ảnh'});prepare('DELETE FROM sample_burn_test_photos WHERE id=?').run(ph.id);try{fs.unlinkSync(path.join(sampleDir,ph.file_name))}catch(_e){}res.status(204).send()}catch(e){next(e)}});
router.delete('/:id',(req,res,next)=>{try{
  const test=getOne(req.params.id);
  if(!test) return res.status(404).json({error:'Không tìm thấy test hàng mẫu'});
  prepare('DELETE FROM sample_burn_tests WHERE id=?').run(test.id);
  for(const photo of test.photos||[]){
    try{fs.unlinkSync(path.join(sampleDir,photo.file_name))}catch(_e){}
  }
  res.status(204).send();
}catch(e){next(e)}});
module.exports=router;