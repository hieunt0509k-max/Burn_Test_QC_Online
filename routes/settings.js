const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { prepare, transaction, db, DB_PATH, UPLOADS_DIR } = require('../database/database');
const { BACKUP_DIR, BACKUP_KEEP, backupNow, listBackups, verifyBackup, restoreBackup } = require('../lib/backup');
const router = express.Router();
const REPORT_LOGO_DIR = path.join(__dirname, '..', 'uploads', 'system');
fs.mkdirSync(REPORT_LOGO_DIR, { recursive: true });
const logoStorage = multer.diskStorage({ destination: REPORT_LOGO_DIR, filename: (_req, file, cb) => cb(null, 'report-logo' + path.extname(file.originalname).toLowerCase()) });
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg)$/.test(file.mimetype)) });
const clean = v => v == null ? '' : String(v).trim();

function audit(action, detail='') {
  try { prepare('INSERT INTO audit_logs(action,detail) VALUES(?,?)').run(action, detail || null); } catch (_) {}
}

router.get('/', (_req,res,next)=>{try{
  const rows=prepare('SELECT key,value FROM app_settings').all(); const settings={}; rows.forEach(x=>settings[x.key]=x.value);
  res.json({settings, backup:{directory:BACKUP_DIR, keep:BACKUP_KEEP, count:fs.existsSync(BACKUP_DIR)?fs.readdirSync(BACKUP_DIR,{withFileTypes:true}).filter(x=>x.isDirectory()).length:0}, database:{path:DB_PATH, size:fs.existsSync(DB_PATH)?fs.statSync(DB_PATH).size:0, uploadSize:dirSize(UPLOADS_DIR)}});
}catch(e){next(e)}});

router.put('/', (req,res,next)=>{try{
  const input=req.body.settings||{}; transaction(()=>{for(const [key,value] of Object.entries(input)){prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime(\'now\')').run(clean(key), clean(value));}});
  audit('SETTINGS_UPDATE', Object.keys(input).join(', ')); res.json({ok:true});
}catch(e){res.status(400).json({error:e.message})}});


router.post('/logo', logoUpload.single('logo'), (req,res,next)=>{try{
  if(!req.file) return res.status(400).json({error:'Vui lòng chọn logo PNG/JPG/WEBP.'});
  const full=path.resolve(req.file.path);
  prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime(\'now\')').run('report_logo_path',full);
  audit('REPORT_LOGO_UPDATE', full);
  res.json({ok:true, path:full, file_url:'/uploads/system/'+req.file.filename});
}catch(e){next(e)}});
router.delete('/logo', (_req,res,next)=>{try{
  const old=prepare('SELECT value FROM app_settings WHERE key=\'report_logo_path\'').get();
  if(old?.value && fs.existsSync(old.value)) { try{fs.unlinkSync(old.value)}catch(_){} }
  prepare('DELETE FROM app_settings WHERE key=\'report_logo_path\'').run(); audit('REPORT_LOGO_DELETE',''); res.json({ok:true});
}catch(e){next(e)}});

function normCustId(v){ if(v===null||v===undefined||v==='') return null; const n=Number(v); return Number.isFinite(n)&&n>0?n:null; }
router.get('/standards', (req,res,next)=>{try{
  const cid = normCustId(req.query.customer_id);
  if(cid){ res.json(prepare('SELECT s.*, c.name AS customer_name FROM qc_standards s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.customer_id IS NULL OR s.customer_id=? ORDER BY s.customer_id IS NULL, s.active DESC, s.name, s.criterion').all(cid)); }
  else { res.json(prepare('SELECT s.*, c.name AS customer_name FROM qc_standards s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.customer_id IS NULL, s.active DESC, s.name, s.criterion').all()); }
}catch(e){next(e)}});
router.get('/units', (_req,res,next)=>{try{
  res.json(prepare('SELECT * FROM qc_units ORDER BY active DESC, name, code').all());
}catch(e){next(e)}});
router.post('/units',(req,res,next)=>{try{
  const code=clean(req.body.code), name=clean(req.body.name);
  if(!code||!name) throw new Error('Mã đơn vị và tên đơn vị là bắt buộc');
  const r=prepare('INSERT INTO qc_units(code,name,active) VALUES(?,?,?)').run(code,name,req.body.active===false?0:1);
  res.status(201).json(prepare('SELECT * FROM qc_units WHERE id=?').get(r.lastInsertRowid));
}catch(e){res.status(400).json({error:e.message})}});
router.put('/units/:id',(req,res,next)=>{try{
  const code=clean(req.body.code), name=clean(req.body.name);
  if(!code||!name) throw new Error('Mã đơn vị và tên đơn vị là bắt buộc');
  prepare('UPDATE qc_units SET code=?,name=?,active=?,updated_at=datetime(\'now\') WHERE id=?').run(code,name,req.body.active===false?0:1,req.params.id);
  res.json(prepare('SELECT * FROM qc_units WHERE id=?').get(req.params.id));
}catch(e){res.status(400).json({error:e.message})}});
router.delete('/units/:id',(req,res,next)=>{try{
  prepare('DELETE FROM qc_units WHERE id=?').run(req.params.id); res.status(204).send();
}catch(e){next(e)}});
router.post('/standards',(req,res,next)=>{try{const name=clean(req.body.name),criterion=clean(req.body.criterion);if(!name||!criterion)throw new Error('Tên tiêu chuẩn và tiêu chí là bắt buộc');const customerId=normCustId(req.body.customer_id);const r=prepare('INSERT INTO qc_standards(name,criterion,min_value,max_value,unit,active,note,customer_id) VALUES(?,?,?,?,?,?,?,?)').run(name,criterion,clean(req.body.min_value)||null,clean(req.body.max_value)||null,clean(req.body.unit)||null,req.body.active===false?0:1,clean(req.body.note)||null,customerId);audit('STANDARD_CREATE',`${name} / ${criterion}`+(customerId?` | cus=${customerId}`:' | global'));res.status(201).json(prepare('SELECT * FROM qc_standards WHERE id=?').get(r.lastInsertRowid))}catch(e){res.status(400).json({error:e.message})}});
router.put('/standards/:id',(req,res,next)=>{try{const id=Number(req.params.id);const customerId=normCustId(req.body.customer_id);prepare('UPDATE qc_standards SET name=?,criterion=?,min_value=?,max_value=?,unit=?,active=?,note=?,customer_id=?,updated_at=datetime(\'now\') WHERE id=?').run(clean(req.body.name),clean(req.body.criterion),clean(req.body.min_value)||null,clean(req.body.max_value)||null,clean(req.body.unit)||null,req.body.active===false?0:1,clean(req.body.note)||null,customerId,id);audit('STANDARD_UPDATE',String(id));res.json(prepare('SELECT * FROM qc_standards WHERE id=?').get(id))}catch(e){res.status(400).json({error:e.message})}});
router.delete('/standards/:id',(req,res,next)=>{try{prepare('DELETE FROM qc_standards WHERE id=?').run(req.params.id);audit('STANDARD_DELETE',String(req.params.id));res.status(204).send()}catch(e){next(e)}});

router.get('/audit',(req,res,next)=>{try{const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));res.json(prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit))}catch(e){next(e)}});
router.post('/backup',(req,res,next)=>{try{const folder=backupNow();audit('BACKUP',folder);res.json({ok:true,folder})}catch(e){res.status(500).json({error:e.message})}});
router.get('/backups', (_req,res,next)=>{try{
  res.json(listBackups().map(x=>({name:x.name,hasDb:x.hasDb,hasUploads:x.hasUploads,dbSize:x.dbSize,uploadSize:x.uploadSize})));
}catch(e){next(e)}});
router.get('/backups/:name/verify', (req,res,next)=>{try{res.json(verifyBackup(req.params.name))}catch(e){res.status(400).json({ok:false,error:e.message})}});
router.post('/backups/:name/restore', (req,res,next)=>{try{
  const result=restoreBackup(req.params.name);
  audit('RESTORE', `${req.params.name} | safety=${result.safetyBackup}`);
  res.json(result);
  setTimeout(()=>process.exit(0), 700);
}catch(e){res.status(400).json({ok:false,error:e.message})}});

router.get('/health',(_req,res,next)=>{try{const integrity=prepare('PRAGMA integrity_check').get(); const quick=prepare('PRAGMA quick_check').get();res.json({ok:integrity.integrity_check==='ok'&&quick.quick_check==='ok',integrity,quick,dbPath:DB_PATH,size:fs.existsSync(DB_PATH)?fs.statSync(DB_PATH).size:0})}catch(e){res.status(500).json({ok:false,error:e.message})}});

function dirSize(dir){let total=0;if(!fs.existsSync(dir))return 0;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);try{if(e.isDirectory())total+=dirSize(p);else total+=fs.statSync(p).size}catch(_){}}return total}
module.exports=router;
