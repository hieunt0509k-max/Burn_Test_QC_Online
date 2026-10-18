const express = require('express');
const { prepare, transaction } = require('../database/database');
const router = express.Router();

const clean = v => v == null ? '' : String(v).trim();
function normResult(v){ const x=clean(v).toUpperCase(); return x==='FAIL'?'FAIL':x==='PENDING'?'PENDING':'PASS'; }

router.get('/templates', (_req,res,next)=>{ try{
  const templates=prepare('SELECT * FROM periodic_templates WHERE active=1 ORDER BY name').all();
  for(const t of templates) t.items=prepare('SELECT id,item_name,standard,sort_order FROM periodic_template_items WHERE template_id=? ORDER BY sort_order,id').all(t.id);
  res.json(templates);
}catch(e){next(e)}});

router.post('/templates', (req,res,next)=>{ try{
  const name=clean(req.body.name); if(!name) throw new Error('Tên checklist là bắt buộc');
  const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length) throw new Error('Checklist phải có ít nhất 1 hạng mục');
  const out=transaction(()=>{
    const r=prepare('INSERT INTO periodic_templates(name,description) VALUES(?,?)').run(name,clean(req.body.description)||null);
    items.forEach((x,i)=>{ const n=clean(x.item_name||x.name); if(n) prepare('INSERT INTO periodic_template_items(template_id,item_name,standard,sort_order) VALUES(?,?,?,?)').run(Number(r.lastInsertRowid),n,clean(x.standard)||null,i); });
    return prepare('SELECT * FROM periodic_templates WHERE id=?').get(r.lastInsertRowid);
  });
  out.items=prepare('SELECT * FROM periodic_template_items WHERE template_id=? ORDER BY sort_order,id').all(out.id); res.status(201).json(out);
}catch(e){res.status(400).json({error:e.message})}});

router.delete('/templates/:id',(req,res,next)=>{try{prepare('DELETE FROM periodic_templates WHERE id=?').run(req.params.id);res.status(204).send()}catch(e){next(e)}});

router.get('/',(req,res,next)=>{try{
  let sql=`SELECT pc.*, pt.name template_name,
    (SELECT COUNT(*) FROM periodic_check_items i WHERE i.check_id=pc.id) item_count,
    (SELECT COUNT(*) FROM periodic_check_items i WHERE i.check_id=pc.id AND i.result='FAIL') fail_items
    FROM periodic_checks pc LEFT JOIN periodic_templates pt ON pt.id=pc.template_id WHERE 1=1`;
  const p=[]; if(req.query.from_date){sql+=' AND pc.check_date>=?';p.push(req.query.from_date)} if(req.query.to_date){sql+=' AND pc.check_date<=?';p.push(req.query.to_date)} if(req.query.result){sql+=' AND pc.overall_result=?';p.push(normResult(req.query.result))} sql+=' ORDER BY pc.check_date DESC, pc.id DESC';
  const rows=prepare(sql).all(...p); for(const r of rows) r.items=prepare('SELECT * FROM periodic_check_items WHERE check_id=? ORDER BY id').all(r.id); res.json(rows);
}catch(e){next(e)}});

router.post('/',(req,res,next)=>{try{
 const date=clean(req.body.check_date); if(!date) throw new Error('Ngày kiểm tra là bắt buộc');
 const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length) throw new Error('Phải có ít nhất 1 hạng mục kiểm tra');
 const overall=normResult(req.body.overall_result || (items.some(x=>normResult(x.result)==='FAIL')?'FAIL':items.some(x=>normResult(x.result)==='PENDING')?'PENDING':'PASS'));
 const id=transaction(()=>{ const r=prepare(`INSERT INTO periodic_checks(check_date,check_time,area,process,shift,inspector,check_type,template_id,overall_result,note) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(date,clean(req.body.check_time)||null,clean(req.body.area)||null,clean(req.body.process)||null,clean(req.body.shift)||null,clean(req.body.inspector)||null,clean(req.body.check_type)||null,req.body.template_id?Number(req.body.template_id):null,overall,clean(req.body.note)||null); const checkId=Number(r.lastInsertRowid); for(const x of items){const result=normResult(x.result); prepare(`INSERT INTO periodic_check_items(check_id,item_name,standard,actual,result,root_cause,corrective_action,owner,deadline,status,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(checkId,clean(x.item_name),clean(x.standard)||null,clean(x.actual)||null,result,clean(x.root_cause)||null,clean(x.corrective_action)||null,clean(x.owner)||null,clean(x.deadline)||null,clean(x.status)||'Closed',clean(x.note)||null)} return checkId; });
 res.status(201).json(prepare('SELECT * FROM periodic_checks WHERE id=?').get(id));
}catch(e){res.status(400).json({error:e.message})}});

router.get('/summary',(req,res,next)=>{try{let sql='SELECT overall_result FROM periodic_checks WHERE 1=1',p=[];if(req.query.from_date){sql+=' AND check_date>=?';p.push(req.query.from_date)}if(req.query.to_date){sql+=' AND check_date<=?';p.push(req.query.to_date)}const rows=prepare(sql).all(...p);res.json({total:rows.length,pass:rows.filter(x=>x.overall_result==='PASS').length,fail:rows.filter(x=>x.overall_result==='FAIL').length,pending:rows.filter(x=>x.overall_result==='PENDING').length})}catch(e){next(e)}});

router.delete('/:id',(req,res,next)=>{try{const r=prepare('DELETE FROM periodic_checks WHERE id=?').run(req.params.id);if(!r.changes)return res.status(404).json({error:'Không tìm thấy log'});res.status(204).send()}catch(e){next(e)}});
module.exports=router;
