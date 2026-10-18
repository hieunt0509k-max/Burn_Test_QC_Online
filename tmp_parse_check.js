
const API = '/api/v1';

// ==================== AUTH ====================
const AUTH_KEY  = 'burnqc_token_v1';
const AUTH_USER = 'burnqc_user_v1';

const Auth = {
  get token(){ return localStorage.getItem(AUTH_KEY) || ''; },
  get user(){ try { return JSON.parse(localStorage.getItem(AUTH_USER) || 'null'); } catch { return null; } },
  set(token, user){ localStorage.setItem(AUTH_KEY, token); localStorage.setItem(AUTH_USER, JSON.stringify(user)); },
  clear(){ localStorage.removeItem(AUTH_KEY); localStorage.removeItem(AUTH_USER); },
  isLoggedIn(){ return !!this.token; }
};

(function(){
  const _origFetch = window.fetch;
  window.fetch = function(url, opts){
    opts = opts || {};
    const isApi = typeof url === 'string' && url.includes('/api/v1');
    if(isApi && Auth.token){
      opts.headers = Object.assign({}, opts.headers || {});
      opts.headers['Authorization'] = 'Bearer ' + Auth.token;
    }
    return _origFetch(url, opts).then(res => {
      if(res.status === 401 && isApi && !url.includes('/auth/login') && !url.includes('/auth/me') && Auth.isLoggedIn()){
        Auth.clear(); applyAuthUI();
      }
      return res;
    });
  };
})();

function markAuthElements(){
  if(!document.body) return;
  const FIXED = ['#addTestBtn','#importBtn','#submitBtn','#cancelEditBtn','#prod_open_add_btn','#prod_open_import_btn','#prod_add_btn','#masterClientNewBtn','#masterPoNewBtn','#masterClientSaveBtn','#masterPoSaveBtn','#masterClientCancelBtn','#masterPoCancelBtn','#btnChangePw','#btnLogout','.settings-actions .btn','.log-section-head .btn','.log-form-actions .btn','.pic-upload-btn','.sample-photo-delete','.standard-form .btn'];
  FIXED.forEach(sel => document.querySelectorAll(sel).forEach(el => el.setAttribute('data-require-auth','1')));
  const REGEX = /(delete|edit|openProductAdd|openProductEdit|openSampleModal|save|upload|remove|backup|restore|change|import|openCamera|capture|chooseSample|addStandardRow)/i;
  document.querySelectorAll('[onclick]').forEach(el => {
    const code = el.getAttribute('onclick') || '';
    if(/openImageModal|openLightbox|openSamplePhotoViewer|loadPhotos|switchView|loadWeeklyReport|loadPhotoGallery|loadSampleTests/i.test(code)) return;
    if(REGEX.test(code)) el.setAttribute('data-require-auth','1');
  });
  document.querySelectorAll('.icon-btn').forEach(el => {
    const t = (el.getAttribute('title') || '').toLowerCase();
    if(/sửa|xóa|edit|delete/.test(t)) el.setAttribute('data-require-auth','1');
  });
}

function applyAuthUI(){
  const logged = Auth.isLoggedIn();
  document.body.classList.toggle('guest', !logged);
  const bLogin  = document.getElementById('btnLogin');
  const bLogout = document.getElementById('btnLogout');
  const bChange = document.getElementById('btnChangePw');
  const nameEl  = document.getElementById('userName');
  if(bLogin)  bLogin.hidden  = logged;
  if(bLogout) bLogout.hidden = !logged;
  if(bChange) bChange.hidden = !logged;
  if(nameEl)  nameEl.textContent = logged ? ((Auth.user && Auth.user.username) || '—') : 'Khách';
  markAuthElements();
}

(function(){
  if(!window.MutationObserver) return;
  const obs = new MutationObserver(() => {
    clearTimeout(window._mkAuthT);
    window._mkAuthT = setTimeout(markAuthElements, 60);
  });
  document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }));
})();

function openLogin(){ const ov = document.getElementById('loginOverlay'); if(ov) ov.classList.add('show'); setTimeout(() => { const inp = document.getElementById('loginUsername'); if(inp) inp.focus(); }, 90); }
function closeLogin(){ const ov = document.getElementById('loginOverlay'); if(ov) ov.classList.remove('show'); const msg = document.getElementById('loginMsg'); if(msg){ msg.textContent = ''; msg.className = 'login-msg'; } }

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginSubmitBtn');
  const msg = document.getElementById('loginMsg');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  msg.className = 'login-msg'; msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  try{
    const r = await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username, password }) });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'Đăng nhập thất bại');
    Auth.set(d.token, d.user);
    closeLogin(); applyAuthUI(); switchView('home');
  }catch(err){ msg.textContent = '✕ ' + err.message; msg.className = 'login-msg show'; }
  finally{ btn.disabled = false; btn.textContent = 'Đăng nhập'; }
});

document.getElementById('loginSkipBtn')?.addEventListener('click', () => { closeLogin(); applyAuthUI(); });
document.getElementById('btnLogin')?.addEventListener('click', openLogin);
document.getElementById('btnLogout')?.addEventListener('click', () => {
  if(!confirm('Đăng xuất khỏi hệ thống?')) return;
  Auth.clear(); applyAuthUI(); switchView('home');
});
document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
  if(!Auth.isLoggedIn()){ openLogin(); return; }
  if(!confirm('Đăng xuất khỏi hệ thống?')) return;
  Auth.clear(); applyAuthUI(); switchView('home');
});
document.getElementById('btnChangePw')?.addEventListener('click', async () => {
  const oldPw = prompt('Nhập mật khẩu hiện tại:'); if(!oldPw) return;
  const newPw = prompt('Nhập mật khẩu mới (tối thiểu 6 ký tự):'); if(!newPw) return;
  if(newPw.length < 6){ alert('Mật khẩu mới quá ngắn'); return; }
  try{
    const r = await fetch(`${API}/auth/change-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ old_password: oldPw, new_password: newPw }) });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'Đổi mật khẩu thất bại');
    alert('✓ Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    Auth.clear(); applyAuthUI(); openLogin();
  }catch(err){ alert('✕ ' + err.message); }
});
function openChangePassword(){
  const btnChangePw = document.getElementById('btnChangePw');
  if(btnChangePw) btnChangePw.click();
  else alert('Vui lòng đăng nhập để đổi mật khẩu.');
}

async function bootstrapAuth(){
  markAuthElements();
  if(Auth.isLoggedIn()){
    try{ const r = await fetch(`${API}/auth/me`); if(r.ok){ const d = await r.json(); Auth.set(Auth.token, d.user); } else { Auth.clear(); } }catch(_){}
  }
  applyAuthUI();
}

// ==================== GLOBAL STATE ====================
let clientsCache = [];
let posCache = [];
let currentEditId = null;
let rowsCache = {};
let currentModalRow = null;

// ==================== HELPERS ====================
function showMsg(el, text, isErr){ el.textContent = text; el.className = 'msg show ' + (isErr ? 'err' : 'ok'); setTimeout(() => el.classList.remove('show'), 3500); }
function formatDateTime(value){ if(!value) return '—'; return String(value).replace('T',' '); }
function stampHtml(result){ if(result === 'PASS') return '<span class="stamp pass">PASS</span>'; if(result === 'FAIL') return '<span class="stamp fail">FAIL</span>'; return '<span class="stamp pending">PENDING</span>'; }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function localDateTimeValue(){ const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function escapeHtml(str){ return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function homeEscape(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatVNDate(s){ const d = new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}); }

function niceStep(max, targetTicks){
  targetTicks = targetTicks || 5;
  if(max <= 0) return 1;
  const rough = max / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let nice;
  if(norm <= 1) nice = 1; else if(norm <= 2) nice = 2; else if(norm <= 5) nice = 5; else nice = 10;
  return nice * pow;
}

function syncTestDateFromStart(){ const start = document.getElementById('start_datetime').value; document.getElementById('test_date').value = start ? start.slice(0,10) : todayISO(); }
document.getElementById('start_datetime').value = localDateTimeValue();
syncTestDateFromStart();
document.getElementById('start_datetime').addEventListener('change', syncTestDateFromStart);

// ==================== LOAD CLIENTS + POs ====================
async function loadClientsAndPos(){
  const [clients, pos] = await Promise.all([
    fetch(`${API}/clients`).then(r => r.json()),
    fetch(`${API}/pos`).then(r => r.json())
  ]);
  clientsCache = clients; posCache = pos;
  const clientMap = Object.fromEntries(clients.map(c => [c.Cus_id, c.Cus_Name]));
  const poSelect = document.getElementById('po_id');
  const filterCustomer = document.getElementById('filterCustomer');
  const filterPo = document.getElementById('filterPo');
  if(poSelect) poSelect.innerHTML = pos.map(p => `<option value="${p.PO_Id}">${p.PO_Name} — ${clientMap[p.Cus_id] || '?'}</option>`).join('') || '<option value="">Chưa có PO nào</option>';
  if(filterCustomer) filterCustomer.innerHTML = '<option value="">Tất cả khách hàng</option>' + clients.map(c => `<option value="${c.Cus_id}">${c.Cus_Name}</option>`).join('');
  if(filterPo) filterPo.innerHTML = '<option value="">Tất cả PO</option>' + pos.map(p => `<option value="${p.PO_Id}">${p.PO_Name}</option>`).join('');
  // Weekly customer filter
  const wCus = document.getElementById('weeklyFilterCustomer');
  if(wCus){
    const cur = wCus.value;
    wCus.innerHTML = '<option value="">Tất cả</option>' + clients.map(c => `<option value="${c.Cus_id}">${c.Cus_Name}</option>`).join('');
    if(cur) wCus.value = cur;
  }
}

// ==================== PRODUCT CODE AUTO-FILL ====================
let productCodeCache = {};
async function loadProductCodesForPO(poId){
  const datalist = document.getElementById('product_code_options');
  productCodeCache = {};
  if(!poId){ datalist.innerHTML = ''; return; }
  try{
    const products = await fetch(`${API}/products?order_id=${poId}`).then(r => r.json());
    datalist.innerHTML = products.map(p => `<option value="${p.Product_Code}">`).join('');
    for(const p of products) productCodeCache[String(p.Product_Code).trim().toUpperCase()] = p;
  } catch(_e){ datalist.innerHTML = ''; }
}

function tryAutofillFromProductCode(){
  const code = document.getElementById('product_code').value.trim().toUpperCase();
  const hint = document.getElementById('product_code_hint');
  if(!code || !productCodeCache[code]){ hint.style.display = 'none'; return; }
  const p = productCodeCache[code];
  if(p.Diameter != null) document.getElementById('diameter').value = p.Diameter;
  if(p.Height != null) document.getElementById('height').value = p.Height;
  if(p.Color) document.getElementById('color').value = p.Color;
  if(p.Fragrance) document.getElementById('frag').value = p.Fragrance;
  if(p.Wick) document.getElementById('wick').value = p.Wick;
  hint.textContent = `✓ Đã tự điền từ dữ liệu sản phẩm (PO: ${p.po_number})`;
  hint.style.display = 'block';
}

document.getElementById('po_id').addEventListener('change', (e) => loadProductCodesForPO(e.target.value));
document.getElementById('product_code').addEventListener('input', tryAutofillFromProductCode);

// ==================== TEST TABLE ====================
const PAGE_SIZE = 10;
let currentPage = 1;
let lastLoadedRows = [];

async function loadTable(resetPage = true){
  const cus_id = document.getElementById('filterCustomer').value;
  const po_id = document.getElementById('filterPo').value;
  const test_result = document.getElementById('filterResult').value;
  const product_code = document.getElementById('filterProduct').value;
  const from_date = document.getElementById('filterFromDate').value;
  const to_date = document.getElementById('filterToDate').value;
  const params = new URLSearchParams();
  if(po_id) params.set('po_id', po_id);
  if(test_result) params.set('test_result', test_result);
  if(product_code) params.set('product_code', product_code);
  if(from_date) params.set('from_date', from_date);
  if(to_date) params.set('to_date', to_date);
  let rows = await fetch(`${API}/po-details?${params}`).then(r => r.json());
  if(cus_id){
    const poCustMap = Object.fromEntries(posCache.map(p => [p.PO_Id, p.Cus_id]));
    rows = rows.filter(r => String(poCustMap[r.PO_Id]) === String(cus_id));
  }
  lastLoadedRows = rows;
  rowsCache = Object.fromEntries(rows.map(r => [r.Id, r]));
  if(resetPage) currentPage = 1;
  renderPage();
  const summary = await fetch(`${API}/po-details/summary`).then(r => r.json());
  document.getElementById('statTotal').textContent = summary.total ?? 0;
  document.getElementById('statPending').textContent = summary.pending_count ?? 0;
  document.getElementById('statPass').textContent = summary.pass_count ?? 0;
  document.getElementById('statFail').textContent = summary.fail_count ?? 0;
}

function renderPage(){
  const rows = lastLoadedRows;
  const poMap = Object.fromEntries(posCache.map(p => [p.PO_Id, p.PO_Name]));
  const custNameMap = Object.fromEntries(clientsCache.map(c => [c.Cus_id, c.Cus_Name]));
  const poCustMap = Object.fromEntries(posCache.map(p => [p.PO_Id, p.Cus_id]));
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if(currentPage > totalPages) currentPage = totalPages;
  if(currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const tbody = document.getElementById('tableBody');
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Chưa có bản ghi test nào</td></tr>';
  } else {
    tbody.innerHTML = pageRows.map(r => {
      const photoSlots = getPhotoSlots(r);
      const firstPhoto = photoSlots.map(slot => r[slot]).find(Boolean) || '';
      return `
      <tr id="row-${r.Id}" class="${Number(currentEditId) === r.Id ? 'editing-row' : ''}">
        <td class="mono test-product-cell">
          <div class="product-code-wrap">
            <a href="#" class="product-link" title="Xem ảnh / chi tiết mã hàng: ${r.Product_Code || '—'}" data-tooltip="Mã hàng: ${r.Product_Code || '—'}" onclick="openImageModal(${r.Id}); return false;">${r.Product_Code}</a>
            ${firstPhoto ? `<div class="product-code-thumb"><img src="${firstPhoto}" alt="${r.Product_Code}" onerror="this.parentElement.style.display='none'"></div>` : ''}
          </div>
          <small>${(r.Color || '—')} · ${(r.Wick || '—')}</small>
        </td>
        <td><span class="test-po">${poMap[r.PO_Id] || r.PO_Id}</span></td>
        <td><span class="test-customer">${custNameMap[poCustMap[r.PO_Id]] ?? '—'}</span></td>
        <td class="mono">${r.Diameter ?? '—'} / ${r.Height ?? '—'}</td>
        <td class="mono">${r.Temperature ?? '—'}°C</td>
        <td class="test-info-cell"><div class="test-info-primary">${formatDateTime(r.Start) || '—'}</div><div class="test-info-secondary">${formatDateTime(r.End) || 'Chưa kết thúc'}</div></td>
        <td class="mono test-burn-time">${r.Total_Burn_Time ?? '—'}</td>
        <td>${r.Tester ?? '—'}</td>
        <td class="quick-result-cell" data-id="${r.Id}" data-result="${r.Test_result||'PENDING'}" title="Bấm để đổi kết quả">${stampHtml(r.Test_result)}</td>
        <td>${renderPics(r)}</td>
        <td><div class="row-actions test-row-actions"><button type="button" class="icon-btn" title="Sửa" onclick="editRow(${r.Id})">✎</button><button type="button" class="icon-btn danger" title="Xóa" onclick="deleteRow(${r.Id})">🗑</button></div></td>
      </tr>`;
    }).join('');
  }
  document.getElementById('countLabel').textContent = `${rows.length} bản ghi`;
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('vi-VN');
  document.getElementById('pageLabel').textContent = `${currentPage} / ${totalPages}`;
  document.getElementById('prevPageBtn').disabled = currentPage <= 1;
  document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
  const totalCount = rows.length;
  const passCount = rows.filter(r => String(r.Test_result || '').toUpperCase() === 'PASS').length;
  const failCount = rows.filter(r => String(r.Test_result || '').toUpperCase() === 'FAIL').length;
  const pendingCount = totalCount - passCount - failCount;
  const statMap = { testListTotal: totalCount, testListPass: passCount, testListFail: failCount, testListPending: pendingCount };
  Object.entries(statMap).forEach(([id,val]) => { const el = document.getElementById(id); if(el) el.textContent = val; });
}

document.getElementById('prevPageBtn').addEventListener('click', () => { if(currentPage > 1){ currentPage--; renderPage(); } });
document.getElementById('nextPageBtn').addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(lastLoadedRows.length / PAGE_SIZE));
  if(currentPage < totalPages){ currentPage++; renderPage(); }
});

function renderPics(r){
  const filled = getPhotoSlots(r).filter(slot => r[slot]).length;
  return `<label style="cursor:pointer; color:var(--copper-dark); font-size:12px; text-decoration:underline;">${filled} ảnh<input type="file" accept="image/*" style="display:none" onchange="uploadImage(${r.Id}, this)"></label>`;
}

// ==================== IMAGE COMPRESS ====================
const MAX_UPLOAD_WIDTH = 1280;
const MAX_UPLOAD_HEIGHT = 960;

async function compressImageForUpload(file){
  if(!file || /^image\/gif$/i.test(file.type)) return file;
  if(!/^image\//i.test(file.type)) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const srcW = img.naturalWidth, srcH = img.naturalHeight;
        const scale = Math.min(1, MAX_UPLOAD_WIDTH / srcW, MAX_UPLOAD_HEIGHT / srcH);
        const outW = Math.max(1, Math.round(srcW * scale));
        const outH = Math.max(1, Math.round(srcH * scale));
        if(scale >= 1 && file.size < 1024 * 1024){ URL.revokeObjectURL(url); resolve(file); return; }
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, outW, outH);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if(!blob || blob.size >= file.size){ resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type:'image/jpeg', lastModified:file.lastModified }));
        }, 'image/jpeg', 0.85);
      } catch (_) { URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadImage(id, input){
  const file = input.files[0]; if(!file) return;
  const slotInput = prompt('Nhập vị trí ảnh (PIC_1 → PIC_5):', 'PIC_1'); if(!slotInput) return;
  const match = String(slotInput).trim().toUpperCase().match(/^PIC[_-]?(\d+)$/);
  if(!match || Number(match[1]) < 1 || Number(match[1]) > 99){ alert('Vị trí ảnh không hợp lệ (PIC_1 → PIC_99)'); return; }
  const fd = new FormData();
  fd.append('pic_slot', match[1]);
  const optimizedFile = await compressImageForUpload(file);
  fd.append('file', optimizedFile);
  const res = await fetch(`${API}/po-details/${id}/images`, { method:'POST', body: fd });
  if(res.ok){ loadTable(false); } else { alert('Lỗi upload ảnh'); }
}

// ==================== IMAGE MODAL ====================
function getPhotoSlots(r){
  const nums = [];
  Object.keys(r || {}).forEach(k => {
    const m = String(k).toUpperCase().match(/^PIC[_-]?(\d+)$/);
    if(m && Number(m[1]) > 0) nums.push(Number(m[1]));
  });
  const photos = Array.isArray(r?.photos) ? r.photos : [];
  photos.forEach(p => { const n=Number(p.slot); if(Number.isInteger(n) && n>0) nums.push(n); });
  for(let i=1;i<=5;i++) nums.push(i);
  return [...new Set(nums)].sort((a,b)=>a-b).map(n=>'PIC_'+n);
}

function addExtraPhoto(){
  if(!currentModalRow) return;
  const slots=getPhotoSlots(currentModalRow);
  const used=slots.map(s=>Number(String(s).match(/\d+$/)?.[0]||0)).filter(Boolean);
  const next=Math.max(5,...used)+1;
  openCamera(currentModalRow.Id, 'PIC_'+next);
}

async function openImageModal(id){
  let r = rowsCache[id];
  if(!r){ r = await fetch(`${API}/po-details/${id}`).then(res => res.json()); }
  if(r.error){ alert('Không tải được dữ liệu bản ghi'); return; }
  // Bổ sung Weight/Size/Frag từ products nếu thiếu
  if((r.Weight == null || r.Weight === '') && r.Product_Code && r.PO_Id){
    try{
      const prods = await fetch(`${API}/products?order_id=${r.PO_Id}`).then(x => x.json());
      if(Array.isArray(prods)){
        const code = String(r.Product_Code).trim().toUpperCase();
        const match = prods.find(p => String(p.Product_Code || '').trim().toUpperCase() === code);
        if(match){
          if(match.Weight != null && match.Weight !== '') r.Weight = match.Weight;
          if(!r.Size && match.Size) r.Size = match.Size;
          if(!r.Frag && match.Fragrance) r.Frag = match.Fragrance;
        }
      }
    }catch(_e){}
  }
  currentModalRow = r;
  document.getElementById('modalProductCode').textContent = r.Product_Code;
  document.getElementById('modalPo').textContent = (posCache.find(p => p.PO_Id === r.PO_Id) || {}).PO_Name || r.PO_Id;
  document.getElementById('modalStart').textContent = formatDateTime(r.Start);
  document.getElementById('modalEnd').textContent = formatDateTime(r.End);
  document.getElementById('modalBurnTime').textContent = r.Total_Burn_Time || '—';
  document.getElementById('modalTemp').textContent = r.Temperature != null ? r.Temperature + '°C' : '—';
  document.getElementById('modalResult').innerHTML = stampHtml(r.Test_result);
  const photoSlots = getPhotoSlots(r);
  document.getElementById('picGrid').innerHTML = photoSlots.map((slot, i) => {
    const url = r[slot]; const num = Number(String(slot).match(/\d+$/)?.[0] || (i + 1));
    return `<div class="pic-slot"><div class="pic-frame" data-slot="${slot}" data-id="${r.Id}">
      ${url ? `<img src="${url}" alt="Ảnh ${num}" onclick="openLightbox('${url}')">` : `<div class="pic-empty"><span>🖼</span>Kéo ảnh vào đây<br>hoặc bấm để chọn</div>`}
      <div class="drop-hint">Thả ảnh vào đây</div><div class="spinner"></div>
    </div><div class="pic-label"><span>Ảnh ${num}</span><div class="pic-actions">
      <button type="button" class="pic-upload-btn" onclick="openCamera(${r.Id}, '${slot}')">📷 Chụp</button>
      <label class="pic-upload-btn">${url ? 'Thay ảnh' : 'Tải lên'}<input type="file" accept="image/*" style="display:none" onchange="uploadImageToSlot(${r.Id}, '${slot}', this.files[0])"></label>
      ${url ? `<button type="button" class="pic-upload-btn" style="color:#d64b4b" onclick="deleteBurnPhoto(${r.Id}, '${slot}')">🗑 Xóa</button>` : ''}
    </div></div></div>`;
  }).join('') + `<div class="pic-slot extra-photo-dropzone" tabindex="0" title="Kéo thả ảnh vào đây hoặc bấm để chụp thêm" style="min-height:120px;align-items:center;justify-content:center;border-style:dashed">
    <button type="button" class="btn btn-ghost" onclick="addExtraPhoto()">＋ Chụp thêm ảnh</button>
    <div class="extra-drop-hint">Hoặc kéo thả nhiều ảnh vào đây</div>
  </div>`;
  wireDragAndDrop();
  document.getElementById('imageModal').classList.add('show');
  await loadLogs(r.Id);
}

function closeImageModal(){
  document.getElementById('imageModal').classList.remove('show');
  currentModalRow = null; closeCamera(); closeLogForm();
  document.getElementById('logTableWrap').innerHTML = '';
}

function exportBurnTestPdf(){
  if(!currentModalRow) return;
  const btn = document.getElementById('exportPdfBtn'); const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xuất...';
  window.location.href = `${API}/burn-tests/${currentModalRow.Id}/report.pdf`;
  setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1500);
}
function exportBurnTestXlsx(){
  if(!currentModalRow) return;
  const btn = document.getElementById('exportXlsxBtn'); const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xuất...';
  window.location.href = `${API}/burn-tests/${currentModalRow.Id}/report.xlsx`;
  setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1500);
}

// ==================== LOGS ====================
async function loadLogs(testId){
  const wrap = document.getElementById('logTableWrap');
  wrap.innerHTML = '<div class="log-empty">Đang tải...</div>';
  try{
    const logs = await fetch(`${API}/burn-tests/${testId}/logs`).then(res => res.json());
    if(!Array.isArray(logs) || logs.length === 0){ wrap.innerHTML = '<div class="log-empty">Chưa có log kiểm tra nào.</div>'; return; }
    wrap.innerHTML = `<div class="log-table-wrap"><table class="log-table">
      <thead><tr><th>Thời gian</th><th>Trạng thái bấc</th><th>Trạng thái ngọn lửa</th><th>Chiều cao bấc</th><th>Tình trạng bể đốt</th><th>Nhiệt độ</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td class="mono">${escapeHtml(l.time_label)}</td>
        <td>${escapeHtml(l.wick_status)}</td>
        <td>${escapeHtml(l.flame_status)}</td>
        <td class="mono">${l.wick_height_mm != null ? l.wick_height_mm + ' mm' : '—'}</td>
        <td>${escapeHtml(l.vessel_condition)}</td>
        <td class="mono">${l.temperature_c != null ? l.temperature_c + '°C' : '—'}</td>
        <td>${l.note ? escapeHtml(l.note) : '—'}</td>
        <td><div class="row-actions"><button type="button" class="icon-btn" title="Sửa" onclick='editLog(${JSON.stringify(l)})'>✎</button><button type="button" class="icon-btn danger" title="Xóa" onclick="deleteLog(${l.id})">🗑</button></div></td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch(_e){ wrap.innerHTML = '<div class="log-empty">Không tải được log.</div>'; }
}

function toggleLogForm(){ const form = document.getElementById('logForm'); if(form.classList.contains('show')) closeLogForm(); else openLogForm(); }
function openLogForm(){ document.getElementById('logForm').classList.add('show'); document.getElementById('toggleLogFormBtn').textContent = '− Đóng form'; }
function closeLogForm(){
  document.getElementById('logForm').classList.remove('show');
  document.getElementById('toggleLogFormBtn').textContent = '+ Thêm log';
  ['logEditingId','logTimeLabel','logWickStatus','logFlameStatus','logWickHeight','logVesselCondition','logTemperature','logNote'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const m = document.getElementById('logFormMsg'); if(m){ m.textContent = ''; m.className = 'msg'; }
}
function editLog(log){
  openLogForm();
  document.getElementById('logEditingId').value = log.id;
  document.getElementById('logTimeLabel').value = log.time_label || '';
  document.getElementById('logWickStatus').value = log.wick_status || '';
  document.getElementById('logFlameStatus').value = log.flame_status || '';
  document.getElementById('logWickHeight').value = log.wick_height_mm ?? '';
  document.getElementById('logVesselCondition').value = log.vessel_condition || '';
  document.getElementById('logTemperature').value = log.temperature_c ?? '';
  document.getElementById('logNote').value = log.note || '';
}
async function submitLog(){
  if(!currentModalRow) return;
  const msg = document.getElementById('logFormMsg');
  msg.textContent = ''; msg.className = 'msg';
  const editingId = document.getElementById('logEditingId').value;
  const payload = { time_label: document.getElementById('logTimeLabel').value.trim(), wick_status: document.getElementById('logWickStatus').value.trim(), flame_status: document.getElementById('logFlameStatus').value.trim(), wick_height_mm: document.getElementById('logWickHeight').value, vessel_condition: document.getElementById('logVesselCondition').value.trim(), temperature_c: document.getElementById('logTemperature').value, note: document.getElementById('logNote').value.trim() };
  const testId = currentModalRow.Id;
  const url = editingId ? `${API}/burn-tests/${testId}/logs/${editingId}` : `${API}/burn-tests/${testId}/logs`;
  const method = editingId ? 'PUT' : 'POST';
  try{
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Lưu log thất bại');
    closeLogForm(); await loadLogs(testId);
  } catch(err){ msg.textContent = err.message; msg.className = 'msg err show'; }
}
async function deleteLog(logId){
  if(!currentModalRow) return;
  if(!confirm('Xóa log kiểm tra này?')) return;
  const testId = currentModalRow.Id;
  try{
    const res = await fetch(`${API}/burn-tests/${testId}/logs/${logId}`, { method:'DELETE' });
    if(!res.ok && res.status !== 204){ const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Xóa log thất bại'); }
    await loadLogs(testId);
  } catch(err){ alert(err.message); }
}

// ==================== DRAG & DROP ====================
function wireDragAndDrop(){
  const grid = document.getElementById('picGrid');
  if(!grid) return;

  const nextExtraSlots = () => {
    const used = getPhotoSlots(currentModalRow || {}).map(slot => {
      const m = String(slot).match(/\d+$/); return m ? Number(m[0]) : 0;
    }).filter(Boolean);
    let n = Math.max(5, ...used) + 1;
    return () => n++;
  };

  const uploadDroppedFiles = async (files, preferredSlot) => {
    const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith('image/'));
    if(!list.length){ alert('Chỉ chấp nhận file ảnh'); return; }
    const id = currentModalRow && currentModalRow.Id;
    if(!id) return;

    let next = nextExtraSlots();
    for(let i = 0; i < list.length; i++){
      let slot = preferredSlot && i === 0 ? preferredSlot : `PIC_${next()}`;
      try { await uploadImageToSlot(id, slot, list[i]); }
      catch(err){ alert('✕ ' + err.message); }
    }
  };

  grid.querySelectorAll('.pic-frame').forEach(frame => {
    const id = frame.dataset.id, slot = frame.dataset.slot;
    frame.addEventListener('click', (e) => {
      if(frame.classList.contains('uploading')) return;
      if(e.target.tagName === 'IMG') return;
      const input = frame.parentElement.querySelector('input[type=file]');
      if(input) input.click();
    });
    ['dragenter','dragover'].forEach(evt => frame.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation(); frame.classList.add('drag-over');
    }));
    ['dragleave','dragend'].forEach(evt => frame.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation(); frame.classList.remove('drag-over');
    }));
    frame.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      frame.classList.remove('drag-over');
      await uploadDroppedFiles(e.dataTransfer.files, slot);
    });
  });

  const extra = grid.querySelector('.extra-photo-dropzone');
  if(extra){
    ['dragenter','dragover'].forEach(evt => extra.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); extra.classList.add('drag-over');
    }));
    ['dragleave','dragend'].forEach(evt => extra.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); extra.classList.remove('drag-over');
    }));
    extra.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation();
      extra.classList.remove('drag-over');
      await uploadDroppedFiles(e.dataTransfer.files);
    });
    extra.addEventListener('click', e => {
      if(e.target.closest('button')) return;
      addExtraPhoto();
    });
    extra.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); addExtraPhoto(); }
    });
  }
}
async function uploadImageToSlot(id, slot, file, frameEl){
  if(!file) return;
  const frame = frameEl || document.querySelector(`.pic-frame[data-slot="${slot}"][data-id="${id}"]`);
  if(frame) frame.classList.add('uploading');
  const fd = new FormData();
  const slotNumber = String(slot).match(/(?:PIC[_-]?)?(\d+)$/)?.[1];
  if(!slotNumber || Number(slotNumber) < 1 || Number(slotNumber) > 99){ if(frame) frame.classList.remove('uploading'); alert('Vị trí ảnh không hợp lệ'); return; }
  fd.append('pic_slot', slotNumber);
  const optimizedFile = await compressImageForUpload(file);
  fd.append('file', optimizedFile);
  try{
    const res = await fetch(`${API}/po-details/${id}/images`, { method:'POST', body: fd });
    if(!res.ok){ const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Lỗi upload ảnh'); }
    await loadTable(false); openImageModal(id);
  } catch(err){ alert('✕ ' + err.message); if(frame) frame.classList.remove('uploading'); }
}

async function deleteBurnPhoto(id, slot){
  if(!id || !slot) return;
  if(!confirm(`Xóa ảnh ${slot} khỏi test này?`)) return;
  try{
    const slotNumber = String(slot).match(/(?:PIC[_-]?)?(\d+)$/)?.[1];
    if(!slotNumber) throw new Error('Vị trí ảnh không hợp lệ');
    const res = await fetch(`${API}/po-details/${id}/photos/${slotNumber}`, { method:'DELETE' });
    if(!res.ok){
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Xóa ảnh thất bại');
    }
    await loadTable(false);
    await openImageModal(id);
  }catch(err){
    alert('✕ ' + err.message);
  }
}

// ==================== LIGHTBOX ====================
// ==================== LIGHTBOX ====================
let lightboxPhotos = [];   // danh sách URL ảnh đang xem
let lightboxIndex  = 0;    // vị trí hiện tại
let lightboxContext = null;

// Hàm tiện: chụp lại photo list từ currentModalRow (burn test)
function buildBurnPhotoList(){
  if(!currentModalRow) return [];
  return getPhotoSlots(currentModalRow)
    .map(slot => currentModalRow[slot])
    .filter(Boolean);
}

function openLightbox(url, context){
  // 1) Xây danh sách ảnh theo context
  let photos = [];
  if(context === 'sample'){
    photos = Array.isArray(window._sampleViewerPhotos) ? window._sampleViewerPhotos.slice() : [];
  } else {
    photos = buildBurnPhotoList();
  }

  // 2) Fallback: chỉ 1 ảnh, không cho navigate
  if(!photos.length) photos = [url];

  // 3) Xác định index của url đang click
  let idx = photos.indexOf(url);
  if(idx < 0){
    // URL có thể bị append ?t=... → so khớp theo phần path
    const base = String(url).split('?')[0];
    idx = photos.findIndex(p => String(p).split('?')[0] === base);
  }
  if(idx < 0){ idx = 0; photos = [url]; }

  lightboxPhotos  = photos;
  lightboxIndex   = idx;
  lightboxContext = context || 'burn';

  renderLightbox();
  document.getElementById('lightbox').classList.add('show');
}

function renderLightbox(){
  const img     = document.getElementById('lightboxImg');
  const counter = document.getElementById('lightboxCounter');
  const prev    = document.querySelector('.lightbox-prev');
  const next    = document.querySelector('.lightbox-next');
  const info    = document.getElementById('lightboxInfo');

  const url = lightboxPhotos[lightboxIndex] || '';
  // fade đổi ảnh cho mượt
  img.style.opacity = '0';
  img.onload  = () => { img.style.opacity = '1'; };
  img.onerror = () => { img.style.opacity = '1'; };
  img.src = url;

  // Counter + nav buttons
  const total = lightboxPhotos.length;
  if(total > 1){
    counter.style.display = 'inline-block';
    counter.textContent = `${lightboxIndex + 1} / ${total}`;
    prev.style.display = 'flex';
    next.style.display = 'flex';
    prev.disabled = lightboxIndex <= 0;
    next.disabled = lightboxIndex >= total - 1;
  } else {
    counter.style.display = 'none';
    prev.style.display    = 'none';
    next.style.display    = 'none';
  }

  // Info box (chỉ hiển thị cho burn test)
  const r = (lightboxContext === 'sample') ? null : currentModalRow;
  if(r){
    const poName   = (posCache.find(p => p.PO_Id === r.PO_Id) || {}).PO_Name || r.PO_Id;
    const size     = (r.Diameter != null || r.Height != null) ? `Ø${r.Diameter ?? '?'} × C${r.Height ?? '?'}` : '—';
    const weight   = (r.Weight != null && r.Weight !== '') ? `${r.Weight}g` : '—';
    const burnTime = r.Total_Burn_Time || '—';
    const result   = r.Test_result || 'PENDING';
    info.innerHTML = `<div class="lb-title">${escapeHtml(r.Product_Code || '—')}</div>
      <div class="lb-row"><span class="lb-label">PO</span><span class="lb-value mono">${escapeHtml(poName)}</span></div>
      <div class="lb-row"><span class="lb-label">Size</span><span class="lb-value mono">${escapeHtml(size)}</span></div>
      <div class="lb-row"><span class="lb-label">Weight</span><span class="lb-value mono">${escapeHtml(weight)}</span></div>
      <div class="lb-row"><span class="lb-label">Tổng đốt</span><span class="lb-value mono">${escapeHtml(burnTime)}</span></div>
      <div class="lb-row"><span class="lb-label">Kết quả</span><span class="lb-value">${escapeHtml(result)}</span></div>`;
    info.style.display = 'block';
  } else {
    info.innerHTML = '';
    info.style.display = 'none';
  }
}

function lightboxPrev(){
  if(lightboxIndex > 0){ lightboxIndex--; renderLightbox(); }
}
function lightboxNext(){
  if(lightboxIndex < lightboxPhotos.length - 1){ lightboxIndex++; renderLightbox(); }
}
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('show');
  lightboxPhotos = [];
  lightboxIndex  = 0;
  lightboxContext = null;
}

// Swipe gesture trên lightbox
(function(){
  let touchStartX = 0, touchStartY = 0, touching = false;
  const lb = document.getElementById('lightbox');
  if(!lb) return;
  lb.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touching = true;
  }, { passive:true });
  lb.addEventListener('touchend', (e) => {
    if(!touching) return;
    touching = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Vuốt ngang > 50px và không nghiêng dọc > 80px
    if(Math.abs(dx) < 50 || Math.abs(dy) > 80) return;
    if(dx < 0) lightboxNext();   // vuốt sang trái → ảnh kế
    else       lightboxPrev();   // vuốt sang phải → ảnh trước
  }, { passive:true });
})();

// ==================== CAMERA + STAMP ====================
let cameraTargetId = null, cameraTargetSlot = null, lastStampedBlob = null;

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function stampInfoOnCanvas(ctx, w, h){
  const r = currentModalRow;
  if(!r) return;

  const poName = (posCache.find(p => p.PO_Id === r.PO_Id) || {}).PO_Name || r.PO_Id || '—';
  const size = (r.Diameter != null || r.Height != null)
    ? `${r.Diameter ?? '?'} × ${r.Height ?? '?'} mm`
    : null;
  const weight = (r.Weight != null && r.Weight !== '') ? `${r.Weight} g` : null;
  const colorWick = [r.Color, r.Wick].filter(Boolean).join(' · ') || null;

  const title = String(r.Product_Code ?? '—');
  const items = [
    ['PO',     String(poName)],
    ['COLOR',  colorWick],
    ['SIZE',   size],
    ['WEIGHT', weight]
  ].filter(([_, v]) => v);

  if(!items.length && !title) return;

  // ---- Font ----
  const FONT      = "'Inter','Segoe UI',Arial,sans-serif";
  const FONT_CJK  = "'Inter','Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Segoe UI',Arial,sans-serif";
  const pickFont  = (txt) => /[\u4e00-\u9fff]/.test(txt) ? FONT_CJK : FONT;

  // ---- Kích thước ----
  const fontSize    = Math.max(16, Math.round(w * 0.020));
  const titleSize   = Math.round(fontSize * 1.45);
  const labelSize   = Math.round(fontSize * 0.72);
  const valueSize   = Math.round(fontSize * 0.98);
  const rowH        = Math.round(fontSize * 1.55);
  const gapAfterTitle = Math.round(fontSize * 0.75);
  const padX        = Math.round(fontSize * 1.0);
  const padY        = Math.round(fontSize * 0.85);
  const accentW     = Math.max(4, Math.round(fontSize * 0.24));
  const colLabelW   = Math.round(fontSize * 3.6);   // cột label cố định
  const radius      = 14;

  // ---- Đo chiều rộng ----
  ctx.font = `700 ${titleSize}px ${FONT}`;
  let maxWidth = ctx.measureText(title).width;

  items.forEach(([label, value]) => {
    ctx.font = `700 ${labelSize}px ${FONT}`;
    // label không cần đo vì có colLabelW cố định, chỉ cần value
    ctx.font = `600 ${valueSize}px ${pickFont(value)}`;
    const vw = ctx.measureText(value).width;
    maxWidth = Math.max(maxWidth, colLabelW + vw + Math.round(fontSize * 0.8));
  });

  const boxW = maxWidth + padX * 2 + accentW;
  const boxH = padY * 2 + titleSize + gapAfterTitle + items.length * rowH;

  const margin = Math.round(fontSize * 1.0);
  const boxX = margin;
  const boxY = h - boxH - margin;

 ctx.save();
  ctx.globalAlpha = 0.75;   // ← 0.75 = mờ 25%, 0.85 = mờ 15%, 0.5 = mờ 50%
  ctx.textBaseline = 'top';

  // ---- Shadow mềm ----
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.round(fontSize * 1.0);
  ctx.shadowOffsetY = Math.round(fontSize * 0.3);

  // ---- Nền tối bo góc ----
  roundRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fillStyle = 'rgba(20,24,30,0.82)';
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ---- Viền sáng mảnh ----
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1, radius);
  ctx.stroke();

  // ---- Accent bar gradient bên trái ----
  ctx.save();
  roundRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.clip();
  const grad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
  grad.addColorStop(0,   '#F0A66A');
  grad.addColorStop(0.5, '#E89B68');
  grad.addColorStop(1,   '#C56A2E');
  ctx.fillStyle = grad;
  ctx.fillRect(boxX, boxY, accentW, boxH);
  ctx.restore();

  // ---- Vị trí bắt đầu text ----
  const textX = boxX + accentW + padX;
  let cursorY = boxY + padY;

  // ============ TITLE căn trái ============
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${titleSize}px ${pickFont(title)}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(title, textX, cursorY + Math.round(fontSize * 0.05));
  cursorY += titleSize + gapAfterTitle;

  // ---- Divider gradient copper → transparent ----
  const divGrad = ctx.createLinearGradient(textX, cursorY, textX + (boxW - padX * 2 - accentW), cursorY);
  divGrad.addColorStop(0,    'rgba(232,155,104,0.7)');
  divGrad.addColorStop(0.55, 'rgba(232,155,104,0.2)');
  divGrad.addColorStop(1,    'rgba(232,155,104,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(textX, cursorY, boxW - padX * 2 - accentW, 1);
  cursorY += Math.round(fontSize * 0.55);

  // ============ CÁC DÒNG DỮ LIỆU ============
  items.forEach(([label, value]) => {
    const rowCenterY = cursorY + rowH / 2;

    // Label xám nhạt — căn trái
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${labelSize}px ${FONT}`;
    ctx.fillStyle = 'rgba(232,155,104,0.85)';
    ctx.fillText(label, textX, rowCenterY);

    // Value trắng — căn trái, sau cột label
    ctx.font = `600 ${valueSize}px ${pickFont(value)}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(value, textX + colLabelW, rowCenterY);

    cursorY += rowH;
  });

  ctx.restore();
}
function openCamera(id, slot){
  cameraTargetId = id; cameraTargetSlot = slot;
  const input = document.getElementById('cameraFileInput'); input.value = ''; input.click();
}
document.getElementById('cameraFileInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0]; if(!file) return;
  await processCapturedPhoto(file);
});
async function processCapturedPhoto(file){
  document.getElementById('cameraOverlay').classList.add('show'); showCameraLoading();
  try{
    const img = await loadImageFromFile(file);
    const canvas = document.getElementById('captureCanvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    stampInfoOnCanvas(ctx, canvas.width, canvas.height);
    canvas.toBlob((blob) => { lastStampedBlob = blob; showCapturePreview(canvas); }, 'image/jpeg', 0.92);
  }catch(err){ showCameraError('Không đọc được ảnh: ' + err.message); }
}
function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File ảnh không hợp lệ')); };
    img.src = url;
  });
}
function showCameraLoading(){ document.getElementById('cameraLoading').style.display = 'block'; document.getElementById('capturePreviewImg').style.display = 'none'; }
function showCapturePreview(canvas){ const p = document.getElementById('capturePreviewImg'); p.src = canvas.toDataURL('image/jpeg', 0.92); document.getElementById('cameraLoading').style.display = 'none'; p.style.display = 'block'; }
function showCameraError(message){ document.getElementById('cameraViewport').innerHTML = `<div class="camera-error">${message}</div>`; }
function closeCamera(){
  document.getElementById('cameraOverlay').classList.remove('show');
  lastStampedBlob = null; cameraTargetId = null; cameraTargetSlot = null;
  const viewport = document.getElementById('cameraViewport');
  if(viewport && !viewport.querySelector('#capturePreviewImg')){
    viewport.innerHTML = `<div class="camera-loading" id="cameraLoading" style="display:none;">Đang xử lý ảnh…</div><img id="capturePreviewImg" style="display:none;" alt="Ảnh vừa chụp">`;
  }
}
document.getElementById('retakeBtn').addEventListener('click', () => {
  document.getElementById('cameraOverlay').classList.remove('show');
  lastStampedBlob = null; document.getElementById('cameraFileInput').click();
});
document.getElementById('useCaptureBtn').addEventListener('click', () => {
  if(!lastStampedBlob){ alert('Chưa có ảnh để dùng'); return; }
  const file = new File([lastStampedBlob], `test-${Date.now()}.jpg`, { type: 'image/jpeg' });
  const id = cameraTargetId, slot = cameraTargetSlot;
  closeCamera(); uploadImageToSlot(id, slot, file);
});
document.getElementById('imageModal').addEventListener('click', (e) => { if(e.target.id === 'imageModal') closeImageModal(); });
document.addEventListener('keydown', (e) => {
  // Điều hướng ảnh khi lightbox đang mở
  const lb = document.getElementById('lightbox');
  if(lb && lb.classList.contains('show')){
    if(e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A'){ e.preventDefault(); lightboxPrev(); return; }
    if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ e.preventDefault(); lightboxNext(); return; }
  }
  if(e.key === 'Escape'){
    closeCamera(); closeLightbox(); closeImageModal();
    if(typeof closeSamplePhotoViewer === 'function') closeSamplePhotoViewer();
    if(typeof closeSampleModal === 'function') closeSampleModal();
    const tm = document.getElementById('testEntryModal');
    if(tm && tm.classList.contains('show')){ if(currentEditId) exitEditMode(); else closeTestEntryModal(); }
  }
});
['dragover','drop'].forEach(evt => {
  document.addEventListener(evt, (e) => { if(e.target.closest && e.target.closest('.pic-frame, .extra-photo-dropzone')) return; e.preventDefault(); });
});

// ==================== EDIT / DELETE ROW ====================
async function editRow(id){
  switchView('tests');
  const msg = document.getElementById('formMsg');
  try{
    await loadClientsAndPos();
    const r = await fetch(`${API}/po-details/${id}`).then(res => res.json());
    if(r.error) throw new Error(r.error);
    document.getElementById('edit_id').value = r.Id;
    const poSelect = document.getElementById('po_id');
    const poIdStr = String(r.PO_Id);
    if(!Array.from(poSelect.options).some(o => String(o.value) === poIdStr)){
      const poObj = posCache.find(p => String(p.PO_Id) === poIdStr);
      if(poObj){ const opt = document.createElement('option'); opt.value = poIdStr; opt.textContent = `${poObj.PO_Name} — ${poObj.Cus_Name || ''}`; poSelect.appendChild(opt); }
    }
    poSelect.value = poIdStr;
    await loadProductCodesForPO(r.PO_Id);
    document.getElementById('product_code').value = r.Product_Code ?? '';
    document.getElementById('diameter').value = r.Diameter ?? '';
    document.getElementById('height').value = r.Height ?? '';
    document.getElementById('color').value = r.Color ?? '';
    document.getElementById('frag').value = r.Frag ?? '';
    document.getElementById('wick').value = r.Wick ?? '';
    document.getElementById('temperature').value = r.Temperature ?? '';
    document.getElementById('start_datetime').value = r.Start ?? '';
    document.getElementById('end_datetime').value = r.End ?? '';
    document.getElementById('total_burn_time').value = r.Total_Burn_Time ?? '';
    document.getElementById('test_date').value = r.Test_date ?? (r.Start ? r.Start.slice(0,10) : todayISO());
    document.getElementById('tester').value = r.Tester ?? '';
    document.getElementById('approved').value = r.Approved ?? '';
    document.getElementById('res_pass').checked = r.Test_result === 'PASS';
    document.getElementById('res_fail').checked = r.Test_result === 'FAIL';
    document.getElementById('res_pending').checked = (r.Test_result === 'PENDING') || !r.Test_result;
    enterEditMode(r.Id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }catch(err){ showMsg(msg, '✕ Không tải được bản ghi: ' + err.message, true); }
}

function openTestEntryModal(isEdit=false){
  const modal = document.getElementById('testEntryModal'); if(!modal) return;
  modal.classList.add('show'); document.body.classList.add('modal-open');
  setTimeout(() => { const first = document.getElementById('po_id'); if(first && !isEdit) first.focus(); }, 80);
}
function closeTestEntryModal(){ const modal = document.getElementById('testEntryModal'); if(modal) modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
function prepareNewTest(){
  currentEditId = null;
  document.getElementById('edit_id').value = '';
  document.getElementById('formTitle').textContent = 'Thêm kết quả test';
  document.getElementById('formEyebrow').textContent = 'MỚI';
  document.getElementById('formEyebrow').classList.remove('editing');
  document.getElementById('submitBtn').textContent = 'Lưu kết quả test';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('entryForm').reset();
  document.getElementById('start_datetime').value = localDateTimeValue();
  document.getElementById('end_datetime').value = '';
  document.getElementById('total_burn_time').value = '';
  syncTestDateFromStart(); openTestEntryModal(false);
}
function enterEditMode(id){
  currentEditId = id;
  document.getElementById('formTitle').textContent = `Sửa kết quả test #${id}`;
  document.getElementById('formEyebrow').textContent = 'ĐANG SỬA';
  document.getElementById('formEyebrow').classList.add('editing');
  document.getElementById('submitBtn').textContent = 'Cập nhật kết quả';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  openTestEntryModal(true); loadTable(false);
}
function exitEditMode(){
  currentEditId = null;
  document.getElementById('edit_id').value = '';
  document.getElementById('formTitle').textContent = 'Thêm kết quả test';
  document.getElementById('formEyebrow').textContent = 'MỚI';
  document.getElementById('formEyebrow').classList.remove('editing');
  document.getElementById('submitBtn').textContent = 'Lưu kết quả test';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('entryForm').reset();
  document.getElementById('start_datetime').value = localDateTimeValue();
  document.getElementById('end_datetime').value = '';
  document.getElementById('total_burn_time').value = '';
  syncTestDateFromStart(); closeTestEntryModal(); loadTable(false);
}
document.getElementById('cancelEditBtn').addEventListener('click', () => { if(currentEditId) exitEditMode(); else closeTestEntryModal(); });
async function deleteRow(id){
  if(!confirm(`Xóa bản ghi test #${id}? Hành động này không thể hoàn tác.`)) return;
  const res = await fetch(`${API}/po-details/${id}`, { method: 'DELETE' });
  if(res.ok || res.status === 204){ if(currentEditId === id) exitEditMode(); loadTable(false); }
  else { alert('Lỗi khi xóa bản ghi'); }
}
document.getElementById('addTestBtn').addEventListener('click', prepareNewTest);
document.getElementById('closeTestEntryBtn').addEventListener('click', () => { if(currentEditId) exitEditMode(); else closeTestEntryModal(); });
document.getElementById('testEntryModal').addEventListener('click', (e) => { if(e.target.id === 'testEntryModal'){ if(currentEditId) exitEditMode(); else closeTestEntryModal(); } });

// ==================== QC EVAL ====================
function qcEvalStatusHtml(status){
  const s = String(status||'PENDING').toUpperCase();
  return s==='PASS' ? '<span class="qc-eval-status pass">✓ PASS</span>' : s==='FAIL' ? '<span class="qc-eval-status fail">✕ FAIL</span>' : '<span class="qc-eval-status pending">⏳ PENDING</span>';
}
function renderQcEvaluation(ev){
  const box = document.getElementById('qcEvaluationBox'); if(!box) return;
  if(!ev || !ev.standards_count){ box.style.display = 'none'; return; }
  const rows = (ev.results||[]).map(x => {
    const st = x.status==='PASS'?'qc-eval-ok':x.status==='FAIL'?'qc-eval-bad':'qc-eval-pending';
    const value = x.values?x.values.join(', '):'—';
    const lim = (x.min!=null?'≥ '+x.min:'')+(x.min!=null&&x.max!=null?' ; ':'')+(x.max!=null?'≤ '+x.max:'');
    return `<div class="qc-eval-row"><div><b>${homeEscape(x.name||'')}</b><br>${homeEscape(x.criterion||'')}</div><div>${homeEscape(value)} ${homeEscape(x.unit||'')}</div><div>${homeEscape(lim||'—')}</div><div class="${st}"><b>${homeEscape(x.status||'')}</b> — ${homeEscape(x.message||'')}</div></div>`;
  }).join('');
  box.style.display = 'block';
  box.innerHTML = `<div class="qc-eval-head"><span class="qc-eval-title">📏 Đánh giá theo QC Standards</span>${qcEvalStatusHtml(ev.status)}</div>${rows}`;
}
async function previewQcEvaluation(){ if(!currentEditId){ document.getElementById('qcEvaluationBox').style.display = 'none'; return; } try{const r = await fetch(`${API}/burn-tests/${currentEditId}/evaluation`); if(r.ok) renderQcEvaluation(await r.json()); }catch(e){} }

// ==================== SUBMIT FORM ====================
document.getElementById('entryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');
  const resultEl = document.querySelector('input[name="test_result"]:checked');
  const payload = {
    po_id: Number(document.getElementById('po_id').value),
    product_code: document.getElementById('product_code').value.trim(),
    diameter: document.getElementById('diameter').value || null,
    height: document.getElementById('height').value || null,
    frag: document.getElementById('frag').value || null,
    color: document.getElementById('color').value || null,
    wick: document.getElementById('wick').value || null,
    temperature: document.getElementById('temperature').value || null,
    start_datetime: document.getElementById('start_datetime').value || null,
    end_datetime: document.getElementById('end_datetime').value || null,
    total_burn_time: document.getElementById('total_burn_time').value.trim() || null,
    test_date: (document.getElementById('start_datetime').value || '').slice(0,10) || document.getElementById('test_date').value || todayISO(),
    time: (document.getElementById('start_datetime').value || '').slice(11,16) || null,
    tester: document.getElementById('tester').value || null,
    approved: document.getElementById('approved').value || null,
    test_result: resultEl ? resultEl.value : 'PENDING'
  };
  if(!payload.po_id){ showMsg(msg, 'Vui lòng chọn PO trước khi lưu', true); return; }
  const isEdit = !!currentEditId;
  btn.disabled = true; btn.textContent = isEdit ? 'Đang cập nhật…' : 'Đang lưu…';
  try{
    const url = isEdit ? `${API}/po-details/${currentEditId}` : `${API}/po-details`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Lỗi không xác định');
    if(data.evaluation) renderQcEvaluation(data.evaluation); else if(isEdit) previewQcEvaluation();
    if(isEdit){ showMsg(msg, `✓ Đã cập nhật mã ${data.Product_Code} (ID #${data.Id})`, false); exitEditMode(); }
    else {
      showMsg(msg, `✓ Đã lưu mã ${data.Product_Code} (ID #${data.Id})`, false);
      closeTestEntryModal();
      document.getElementById('qcEvaluationBox').style.display = 'none';
      e.target.reset();
      document.getElementById('start_datetime').value = localDateTimeValue();
      document.getElementById('end_datetime').value = '';
      document.getElementById('total_burn_time').value = '';
      syncTestDateFromStart(); loadTable();
    }
  }catch(err){ showMsg(msg, '✕ ' + err.message, true); }
  finally{ btn.disabled = false; btn.textContent = isEdit ? 'Cập nhật kết quả' : 'Lưu kết quả test'; }
});

// ==================== IMPORT ====================
function openImportModal(){ document.getElementById('importModal').classList.add('show'); document.getElementById('importText').focus(); }
function closeImportModal(){ document.getElementById('importModal').classList.remove('show'); document.getElementById('importMsg').className = 'msg'; document.getElementById('importPreview').textContent = ''; }
function normalizeImportHeader(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/đ/g,'d').replace(/[^a-z0-9_]/g,''); }
function parseImportData(text){
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim() !== '');
  if(!lines.length) return { rows:[], hasHeader:false };
  const aliases = { cus_name:['cus_name','customer','customer_name','khach_hang','ten_khach_hang'], po_name:['po_name','po','purchase_order','order'], product_code:['product_code','product','code','ma_sp','ma_hang'], diameter:['diameter','dia','duong_kinh'], height:['height','cao','chieu_cao'], frag:['frag','fragrance','huong','mui'], color:['color','mau'], wick:['wick','tim','wick_type'] };
  const first = lines[0].split('\t').map(normalizeImportHeader);
  const headerKeys = Object.keys(aliases);
  const headerLooksValid = first.some(x => headerKeys.some(k => aliases[k].includes(x)));
  let start = 0;
  let indexes = { cus_name:0, po_name:1, product_code:2, diameter:3, height:4, frag:5, color:6, wick:7 };
  if(headerLooksValid){
    start = 1;
    for(const key of headerKeys){ const idx = first.findIndex(h => aliases[key].includes(h)); if(idx >= 0) indexes[key] = idx; }
  }
  const rows = [];
  for(let i=start;i<lines.length;i++){
    const cols = lines[i].split('\t');
    if(cols.every(c => !String(c).trim())) continue;
    const row = {};
    for(const key of headerKeys) row[key] = String(cols[indexes[key]] ?? '').trim();
    rows.push(row);
  }
  return { rows, hasHeader:headerLooksValid };
}
document.getElementById('importBtn').addEventListener('click', openImportModal);
document.getElementById('importText').addEventListener('input', () => {
  const parsed = parseImportData(document.getElementById('importText').value);
  const preview = document.getElementById('importPreview');
  preview.textContent = parsed.rows.length ? `Đã nhận ${parsed.rows.length} dòng${parsed.hasHeader ? ' (đã nhận diện tiêu đề)' : ''}.` : 'Chưa có dữ liệu.';
});
async function getOrCreateCustomer(name){
  const wanted = String(name || '').trim();
  if(!wanted) throw new Error('Thiếu Cus_Name');
  let found = clientsCache.find(c => String(c.Cus_Name || c.name || '').trim().toLowerCase() === wanted.toLowerCase());
  if(found) return Number(found.Cus_id ?? found.id);
  const res = await fetch(`${API}/clients`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ cus_name:wanted }) });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || `Không tạo được khách hàng: ${wanted}`);
  await loadClientsAndPos();
  return Number(data.Cus_id ?? data.id);
}
async function getOrCreatePO(customerId, poName){
  const wanted = String(poName || '').trim();
  if(!wanted) throw new Error('Thiếu PO_Name');
  let found = posCache.find(p => Number(p.Cus_id ?? p.customer_id) === Number(customerId) && String(p.PO_Name ?? p.po_number ?? '').trim().toLowerCase() === wanted.toLowerCase());
  if(found) return Number(found.PO_Id ?? found.id);
  const res = await fetch(`${API}/pos`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ cus_id:Number(customerId), po_name:wanted }) });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || `Không tạo được PO: ${wanted}`);
  await loadClientsAndPos();
  return Number(data.PO_Id ?? data.id);
}
async function importOneRow(row){
  if(!row.cus_name) throw new Error('Thiếu Cus_Name');
  if(!row.po_name) throw new Error('Thiếu PO_Name');
  if(!row.product_code) throw new Error('Thiếu Product_Code');
  const customerId = await getOrCreateCustomer(row.cus_name);
  const poId = await getOrCreatePO(customerId, row.po_name);
  const payload = { purchase_order_id: poId, po_id: poId, product_code: row.product_code, diameter: row.diameter || null, height: row.height || null, frag: row.frag || null, color: row.color || null, wick: row.wick || null, temperature: null, start_datetime: null, end_datetime: null, total_burn_time: null, test_date: todayISO(), time: null, tester: null, approved: null, test_result: 'PENDING' };
  const res = await fetch(`${API}/po-details`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || `Không import được ${row.product_code}`);
  return data;
}
document.getElementById('doImportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('doImportBtn');
  const msg = document.getElementById('importMsg');
  const parsed = parseImportData(document.getElementById('importText').value);
  if(!parsed.rows.length){ showMsg(msg, 'Không có dữ liệu để import.', true); return; }
  btn.disabled = true; btn.textContent = 'Đang import…';
  let success = 0; const errors = [];
  try{
    for(let i=0;i<parsed.rows.length;i++){
      try{ await importOneRow(parsed.rows[i]); success++; }
      catch(err){ errors.push(`Dòng ${i + (parsed.hasHeader ? 2 : 1)}: ${err.message}`); }
    }
    await loadClientsAndPos(); await loadTable();
    if(errors.length) showMsg(msg, `✓ Import ${success}/${parsed.rows.length} dòng. ${errors.length} lỗi: ${errors.slice(0,3).join(' | ')}`, success === 0);
    else { showMsg(msg, `✓ Đã import thành công ${success} dòng.`, false); document.getElementById('importText').value = ''; document.getElementById('importPreview').textContent = ''; }
  }catch(err){ showMsg(msg, '✕ ' + err.message, true); }
  finally{ btn.disabled = false; btn.textContent = 'Import dữ liệu'; }
});

// ==================== FILTERS ====================
document.getElementById('refreshBtn').addEventListener('click', () => loadTable());

document.getElementById('clearTestFiltersBtn').addEventListener('click', () => {
  document.getElementById('filterCustomer').value = '';
  document.getElementById('filterPo').innerHTML = '<option value="">Tất cả PO</option>' + posCache.map(p => `<option value="${p.PO_Id}">${p.PO_Name}</option>`).join('');
  document.getElementById('filterResult').value = '';
  document.getElementById('filterProduct').value = '';
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  loadTable();
});

async function exportFilteredBurnTests(){
  const params = new URLSearchParams();
  const cus_id = document.getElementById('filterCustomer').value; if(cus_id) params.set('customer_id', cus_id);
  const po_id = document.getElementById('filterPo').value; if(po_id) params.set('po_id', po_id);
  const test_result = document.getElementById('filterResult').value; if(test_result) params.set('test_result', test_result);
  const product_code = document.getElementById('filterProduct').value.trim(); if(product_code) params.set('product_code', product_code);
  const from_date = document.getElementById('filterFromDate').value; if(from_date) params.set('from_date', from_date);
  const to_date = document.getElementById('filterToDate').value; if(to_date) params.set('to_date', to_date);
  const btn = document.getElementById('exportListXlsxBtn'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xuất...';
  try { window.location.href = `${API}/burn-tests/export.xlsx?${params.toString()}`; }
  finally { setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 1200); }
}
document.getElementById('exportListXlsxBtn').addEventListener('click', exportFilteredBurnTests);
document.getElementById('filterCustomer').addEventListener('change', () => {
  const cus_id = document.getElementById('filterCustomer').value;
  const filterPo = document.getElementById('filterPo');
  const filteredPos = cus_id ? posCache.filter(p => String(p.Cus_id) === String(cus_id)) : posCache;
  filterPo.innerHTML = '<option value="">Tất cả PO</option>' + filteredPos.map(p => `<option value="${p.PO_Id}">${p.PO_Name}</option>`).join('');
  loadTable();
});
document.getElementById('filterPo').addEventListener('change', () => loadTable());
document.getElementById('filterResult').addEventListener('change', () => loadTable());
document.getElementById('filterFromDate').addEventListener('change', () => loadTable());
document.getElementById('filterToDate').addEventListener('change', () => loadTable());
document.getElementById('filterProduct').addEventListener('input', () => { clearTimeout(window._ft); window._ft = setTimeout(() => loadTable(), 350); });

// ==================== BACKUP ====================
async function backupNow(){
  const btn = document.getElementById('backupNowBtn');
  const status = document.getElementById('backupStatus');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Đang backup...';
  status.textContent = ''; status.style.color = '';
  try{
    const res = await fetch(`${API}/backup`, { method: 'POST' });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Backup thất bại');
    status.textContent = `✓ Đã backup lúc ${new Date().toLocaleTimeString('vi-VN')}`;
    status.style.color = 'var(--pass)';
  }catch(err){ status.textContent = `✗ ${err.message}`; status.style.color = 'var(--fail)'; }
  finally{ btn.disabled = false; btn.textContent = original; }
}

// ==================== INIT ====================
(async function init(){
  await bootstrapAuth();
  await loadClientsAndPos();
  populateProductPoSelects();
  await loadProductCodesForPO(document.getElementById('po_id').value);
  await loadTable();
  switchView('home');
})();

// ==================== WEEKLY REPORT ====================
let weeklyReportCache = null;
function getWeekRangeDefault(){
  const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 6);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { from:iso(start), to:iso(end) };
}

async function loadWeeklyReport(){
  const from = document.getElementById('weeklyFrom');
  const to = document.getElementById('weeklyTo');
  if(!from.value || !to.value){ const r = getWeekRangeDefault(); from.value = r.from; to.value = r.to; }

  const cusId = document.getElementById('weeklyFilterCustomer')?.value || '';
  const resFlt = document.getElementById('weeklyFilterResult')?.value || '';

  try{
    if(!posCache || !posCache.length){ await loadClientsAndPos(); }

    const allTests = await fetchAllTestsNormalized();

    // Lọc theo ngày
    let filtered = allTests.filter(t => {
      const d = t.test_date;
      return d >= from.value && d <= to.value;
    });

    // Lọc theo khách hàng
    if(cusId){
      const poCustMap = {};
      posCache.forEach(p => { poCustMap[String(p.PO_Id)] = String(p.Cus_id); });
      filtered = filtered.filter(t => {
        // Ưu tiên customer_id có sẵn, fallback tra qua PO
        if(t.customer_id) return String(t.customer_id) === String(cusId);
        return poCustMap[String(t.po_id)] === String(cusId);
      });
    }

    // Lọc theo kết quả
    if(resFlt){
      filtered = filtered.filter(t => t.test_result === resFlt);
    }

    // Summary
    const total = filtered.length;
    const pass_count = filtered.filter(t => t.test_result === 'PASS').length;
    const fail_count = filtered.filter(t => t.test_result === 'FAIL').length;
    const pending_count = filtered.filter(t => t.test_result === 'PENDING').length;
    const pass_rate = total > 0 ? (pass_count / total) * 100 : 0;

    // Daily
    const dayMap = {};
    const dFrom = new Date(`${from.value}T00:00:00`);
    const dTo = new Date(`${to.value}T00:00:00`);
    for(let d = new Date(dFrom); d <= dTo; d.setDate(d.getDate() + 1)){
      const isoD = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      dayMap[isoD] = { date: isoD, total: 0, pass: 0, fail: 0, pending: 0 };
    }
    filtered.forEach(t => {
      const date = t.test_date;
      if(!date) return;
      if(!dayMap[date]) dayMap[date] = { date, total: 0, pass: 0, fail: 0, pending: 0 };
      const x = dayMap[date]; x.total++;
      if(t.test_result === 'PASS') x.pass++;
      else if(t.test_result === 'FAIL') x.fail++;
      else x.pending++;
    });
    const daily = Object.values(dayMap).sort((a,b) => a.date.localeCompare(b.date));

    const data = { from_date: from.value, to_date: to.value, total, pass_count, fail_count, pending_count, pass_rate, daily };
    weeklyReportCache = data;

    // Render KPI
    document.getElementById('weeklyTotal').textContent = data.total;
    document.getElementById('weeklyPass').textContent = data.pass_count;
    document.getElementById('weeklyFail').textContent = data.fail_count;
    document.getElementById('weeklyPending').textContent = data.pending_count;
    document.getElementById('weeklyPassRate').textContent = `${Number(data.pass_rate).toFixed(1)}%`;
    document.getElementById('weeklyRangeLabel').textContent = `${formatVNDate(data.from_date)} — ${formatVNDate(data.to_date)}`;

    const setBar = (sel, val, total) => {
      const card = document.querySelector(sel); if(!card) return;
      card.querySelector('.metric-progress')?.remove();
      const pct = total > 0 ? Math.min(100, (val / total) * 100) : 0;
      const bar = document.createElement('div');
      bar.className = 'metric-progress';
      bar.innerHTML = `<div class="metric-progress-fill" style="width:${pct}%"></div>`;
      card.appendChild(bar);
    };
    setBar('.weekly-metric.pass', data.pass_count, data.total);
    setBar('.weekly-metric.fail', data.fail_count, data.total);
    setBar('.weekly-metric.pending', data.pending_count, data.total);
    setBar('.weekly-metric.total', data.total, data.total);

    renderWeeklyChart(data.daily);
    renderWeeklyInsights(data.daily);

    document.getElementById('weeklyTableBody').innerHTML = data.daily.map(x => {
      const total = Number(x.total) || 0;
      const pct = total > 0 ? (Number(x.pass) / total) * 100 : 0;
      const cls = pct === 0 ? 'zero' : pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
      const d = new Date(`${x.date}T00:00:00`);
      const wd = !isNaN(d.getTime()) ? ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()] : '';
      return `<tr>
        <td><div class="date-cell"><span class="d-weekday">${wd}</span><span class="d-date">${formatVNDate(x.date)}</span></div></td>
        <td><b>${total}</b></td>
        <td style="color:#329b58;font-weight:600">${x.pass}</td>
        <td style="color:#e33f3c;font-weight:600">${x.fail}</td>
        <td style="color:#d99b00;font-weight:600">${x.pending}</td>
        <td><div class="rate-cell"><div class="rate-bar"><div class="rate-bar-fill ${cls}" style="width:${pct}%"></div></div><span class="rate-num ${cls}">${pct.toFixed(1)}%</span></div></td>
      </tr>`;
    }).join('') + (() => {
      const tAll = data.daily.reduce((s,x) => s + Number(x.total||0), 0);
      const pAll = data.daily.reduce((s,x) => s + Number(x.pass||0), 0);
      const fAll = data.daily.reduce((s,x) => s + Number(x.fail||0), 0);
      const pdAll = data.daily.reduce((s,x) => s + Number(x.pending||0), 0);
      const pctAll = tAll > 0 ? (pAll/tAll)*100 : 0;
      const cls = pctAll === 0 ? 'zero' : pctAll >= 80 ? 'high' : pctAll >= 50 ? 'mid' : 'low';
      return `<tr style="background:linear-gradient(180deg,#EAF5FB,#E1EFFB);border-top:2px solid #B8D9F0">
        <td><b>TỔNG CỘNG</b></td><td><b>${tAll}</b></td>
        <td style="color:#329b58"><b>${pAll}</b></td>
        <td style="color:#e33f3c"><b>${fAll}</b></td>
        <td style="color:#d99b00"><b>${pdAll}</b></td>
        <td><div class="rate-cell"><div class="rate-bar"><div class="rate-bar-fill ${cls}" style="width:${pctAll}%"></div></div><span class="rate-num ${cls}"><b>${pctAll.toFixed(2)}%</b></span></div></td>
      </tr>`;
    })();

    await renderWeeklyCompare(data, allTests);
    await renderWeeklyTopPo(data, allTests);
  }catch(err){ alert(err.message); }
}

function renderWeeklyChart(daily){
  const bars = document.getElementById('weeklyBars');
  const yaxis = document.getElementById('weeklyYAxis');
  const max = Math.max(1, ...daily.flatMap(x => [Number(x.pass)||0, Number(x.fail)||0, Number(x.pending)||0]));
  const step = niceStep(max, 5);
  const ticks = [];
  for(let v = 0; v <= step * 5; v += step) ticks.push(v);
  const top = ticks[ticks.length - 1] || step;
  yaxis.innerHTML = ticks.slice().reverse().map(v => `<span>${v}</span>`).join('');
  const h = v => `${((Number(v) || 0) / top) * 100}%`;
  bars.innerHTML = daily.map(x => {
    const total = Number(x.total) || 0;
    const isEmpty = total === 0;
    return `<div class="day-bar"${isEmpty ? ' style="opacity:.4"' : ''}>
      <div class="bar-group">
        <div class="bar-col bar-pass" style="height:${h(x.pass)}" title="Đạt: ${x.pass}" data-tooltip="Đạt: ${x.pass}">${(+x.pass > 0) ? `<span class="bar-value">${x.pass}</span>` : ''}</div>
        <div class="bar-col bar-fail" style="height:${h(x.fail)}" title="Không đạt: ${x.fail}" data-tooltip="Không đạt: ${x.fail}">${(+x.fail > 0) ? `<span class="bar-value">${x.fail}</span>` : ''}</div>
        <div class="bar-col bar-pending" style="height:${h(x.pending)}" title="Pending: ${x.pending}" data-tooltip="Pending: ${x.pending}">${(+x.pending > 0) ? `<span class="bar-value">${x.pending}</span>` : ''}</div>
      </div>
      ${isEmpty ? '<span class="day-empty">—</span>' : ''}
      <span class="day-label">${formatVNDate(x.date).slice(0,5)}</span>
    </div>`;
  }).join('');
}

function renderWeeklyInsights(daily){
  const box = document.getElementById('weeklyInsights'); if(!box) return;
  const daySorted = [...daily].sort((a,b) => b.total - a.total);
  const mostPass  = [...daily].sort((a,b) => b.pass - a.pass)[0];
  const mostFail  = [...daily].sort((a,b) => b.fail - a.fail)[0];
  const bestDay = daySorted[0];
  box.innerHTML = `
    <div class="insight-card"><div class="insight-icon">📅</div><div class="insight-body"><small>Ngày đông nhất</small><b>${bestDay && bestDay.total > 0 ? `${formatVNDate(bestDay.date)} · ${bestDay.total} test` : '—'}</b></div></div>
    <div class="insight-card green"><div class="insight-icon">✓</div><div class="insight-body"><small>Ngày nhiều PASS nhất</small><b>${mostPass && mostPass.pass > 0 ? `${formatVNDate(mostPass.date)} · ${mostPass.pass} PASS` : '—'}</b></div></div>
    <div class="insight-card red"><div class="insight-icon">✕</div><div class="insight-body"><small>Ngày cần chú ý</small><b>${mostFail && mostFail.fail > 0 ? `${formatVNDate(mostFail.date)} · ${mostFail.fail} FAIL` : '✓ Không có FAIL'}</b></div></div>`;
}

async function renderWeeklyCompare(data, allTests){
  const box = document.getElementById('weeklyCompare'); if(!box) return;
  try{
    const dFrom = new Date(`${data.from_date}T00:00:00`);
    const dTo   = new Date(`${data.to_date}T00:00:00`);
    const days  = Math.round((dTo - dFrom) / 86400000) + 1;
    const prevTo = new Date(dFrom); prevTo.setDate(dFrom.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - days + 1);
    const isoD = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const prevFromISO = isoD(prevFrom);
    const prevToISO = isoD(prevTo);

    const list = allTests || [];
    const prevFiltered = list.filter(t => t.test_date >= prevFromISO && t.test_date <= prevToISO);
    const prevTotal = prevFiltered.length;
    const prevPass = prevFiltered.filter(t => t.test_result === 'PASS').length;
    const prevRate = prevTotal > 0 ? (prevPass / prevTotal) * 100 : 0;

    const diff = Number(data.total||0) - prevTotal;
    const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '●';
    box.innerHTML = `
      <span class="compare-item ${cls}"><span class="compare-arrow">${arrow}</span><b>${diff >= 0 ? '+' : ''}${diff}</b> test <small>(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% so với kỳ trước)</small></span>
      <span class="compare-item">Kỳ trước: <b>${prevTotal}</b> test · <b>${prevRate.toFixed(1)}%</b> PASS</span>
      <span class="compare-item">Kỳ này: <b>${data.total}</b> test · <b>${Number(data.pass_rate||0).toFixed(1)}%</b> PASS</span>`;
  }catch(_){ box.innerHTML = ''; }
}

async function renderWeeklyTopPo(data, allTests){
  const body = document.getElementById('weeklyPoBody'); if(!body) return;
  body.innerHTML = '<tr><td colspan="6" class="module-empty">Đang tải...</td></tr>';
  try{
    if(!posCache || !posCache.length) await loadClientsAndPos();
    const cusId = document.getElementById('weeklyFilterCustomer')?.value || '';
    const resFlt = document.getElementById('weeklyFilterResult')?.value || '';

    const poCustMap = {};
    posCache.forEach(p => { poCustMap[String(p.PO_Id)] = String(p.Cus_id); });

    const inRange = (allTests || []).filter(t => {
      if(!(t.test_date >= data.from_date && t.test_date <= data.to_date)) return false;
      if(cusId){
        if(t.customer_id){
          if(String(t.customer_id) !== String(cusId)) return false;
        } else {
          if(poCustMap[String(t.po_id)] !== String(cusId)) return false;
        }
      }
      if(resFlt && t.test_result !== resFlt) return false;
      return true;
    });

    const poMap = {};
    inRange.forEach(t => {
      const key = t.po_number || `#${t.po_id}`;
      if(!poMap[key]) poMap[key] = { po: key, cus: t.customer_name || '—', total: 0, pass: 0, fail: 0 };
      const x = poMap[key]; x.total++;
      if(t.test_result === 'PASS') x.pass++;
      else if(t.test_result === 'FAIL') x.fail++;
    });
    const topPo = Object.values(poMap).sort((a, b) => b.total - a.total).slice(0, 5);
    body.innerHTML = topPo.length ? topPo.map(x => {
      const pct = x.total ? (x.pass / x.total) * 100 : 0;
      const cls = pct === 0 ? 'zero' : pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
      return `<tr>
        <td><b>${homeEscape(x.po)}</b></td>
        <td>${homeEscape(x.cus)}</td>
        <td><b>${x.total}</b></td>
        <td style="color:#329b58">${x.pass}</td>
        <td style="color:#e33f3c">${x.fail}</td>
        <td><div class="rate-cell"><div class="rate-bar"><div class="rate-bar-fill ${cls}" style="width:${pct}%"></div></div><span class="rate-num ${cls}">${pct.toFixed(1)}%</span></div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="module-empty">Không có dữ liệu trong kỳ.</td></tr>';
  } catch(e){ body.innerHTML = `<tr><td colspan="6" class="module-empty">Lỗi: ${homeEscape(e.message)}</td></tr>`; }
}
function weeklyReportUrl(type){
  if(!weeklyReportCache) return null;
  const q = new URLSearchParams({ from_date:weeklyReportCache.from_date, to_date:weeklyReportCache.to_date });
  return `${API}/burn-tests/weekly-report.${type}?${q}`;
}
document.getElementById('weeklyLoadBtn').addEventListener('click', loadWeeklyReport);
document.getElementById('weeklyFrom').addEventListener('change', () => { if(document.getElementById('weeklyFrom').value > document.getElementById('weeklyTo').value) document.getElementById('weeklyTo').value = document.getElementById('weeklyFrom').value; });
document.getElementById('weeklyFilterCustomer')?.addEventListener('change', loadWeeklyReport);
document.getElementById('weeklyFilterResult')?.addEventListener('change', loadWeeklyReport);

async function downloadWeeklyReport(type){
  const u = weeklyReportUrl(type); if(!u) return alert('Hãy bấm Tìm trước.');
  const btn = type === 'pdf' ? document.getElementById('weeklyPdfBtn') : document.getElementById('weeklyXlsxBtn');
  const oldText = btn ? btn.textContent : '';
  try{
    if(btn){ btn.disabled = true; btn.textContent = '⏳ Đang tạo...'; }
    const r = await fetch(u);
    if(!r.ok){ const text = await r.text(); let msg = 'Không tạo được báo cáo'; try{ msg = JSON.parse(text).error||msg; }catch{} throw new Error(msg + ` (HTTP ${r.status})`); }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename=\"?([^\";]+)\"?/i);
    const filename = m ? m[1] : `bao-cao-tuan.${type==='pdf'?'pdf':'xlsx'}`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }catch(err){ alert('Lỗi xuất báo cáo: ' + err.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = oldText; } }
}
document.getElementById('weeklyPdfBtn').addEventListener('click', () => downloadWeeklyReport('pdf'));
document.getElementById('weeklyXlsxBtn').addEventListener('click', () => downloadWeeklyReport('xlsx'));

// ==================== MASTER ====================
let masterEditingClientId = null, masterEditingPoId = null, masterClients = [], masterPos = [];
const MASTER_PAGE_SIZE = 10;
let masterClientPage = 1, masterPoPage = 1;

async function apiJsonMaster(url, options){
  const r = await fetch(url, options);
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`Server trả về dữ liệu không hợp lệ (${r.status})`); }
  if(!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
function escMaster(v){ return String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
async function loadMasterData(){
  try{
    const [clients,pos] = await Promise.all([apiJsonMaster(`${API}/clients`), apiJsonMaster(`${API}/pos`)]);
    masterClients = Array.isArray(clients) ? clients : [];
    masterPos = Array.isArray(pos) ? pos : [];
    renderMaster();
  }catch(err){
    document.getElementById('masterClientBody').innerHTML = `<tr><td colspan="3" class="master-empty">⚠ ${escMaster(err.message)}</td></tr>`;
    document.getElementById('masterPoBody').innerHTML = `<tr><td colspan="4" class="master-empty">Không tải được dữ liệu.</td></tr>`;
  }
}
function renderMaster(){
  document.getElementById('masterClientCount').textContent = masterClients.length;
  document.getElementById('masterPoCount').textContent = masterPos.length;
  document.getElementById('masterTestCount').textContent = masterPos.reduce((s,p) => s + Number(p.test_count||0), 0);
  const q = (document.getElementById('masterClientSearch').value||'').toLowerCase().trim();
  const cq = Number(document.getElementById('masterPoFilter').value||0);
  const counts = {}; masterPos.forEach(p => counts[p.Cus_id] = (counts[p.Cus_id]||0) + 1);
  const filteredClients = masterClients.filter(c => !q || String(c.Cus_Name).toLowerCase().includes(q));
  const filteredPos = masterPos.filter(p => !cq || Number(p.Cus_id) === cq);
  masterClientPage = Math.min(masterClientPage, Math.max(1, Math.ceil(filteredClients.length / MASTER_PAGE_SIZE)));
  masterPoPage = Math.min(masterPoPage, Math.max(1, Math.ceil(filteredPos.length / MASTER_PAGE_SIZE)));
  const clientStart = (masterClientPage-1) * MASTER_PAGE_SIZE;
  const poStart = (masterPoPage-1) * MASTER_PAGE_SIZE;
  const clientRows = filteredClients.slice(clientStart, clientStart + MASTER_PAGE_SIZE);
  const poRows = filteredPos.slice(poStart, poStart + MASTER_PAGE_SIZE);
  document.getElementById('masterClientBody').innerHTML = clientRows.map(c => `<tr><td><b>${escMaster(c.Cus_Name)}</b></td><td><span class="master-badge">${counts[c.Cus_id]||0} PO</span></td><td><div class="master-actions"><button class="icon-btn" title="Sửa" onclick="editMasterClient(${c.Cus_id})">✎</button><button class="icon-btn danger" title="Xóa" onclick="deleteMasterClient(${c.Cus_id})">×</button></div></td></tr>`).join('') || '<tr><td colspan="3" class="master-empty">Chưa có khách hàng.</td></tr>';
  document.getElementById('masterPoBody').innerHTML = poRows.map(p => `<tr><td><b>${escMaster(p.PO_Name)}</b></td><td>${escMaster(p.Cus_Name)}</td><td><span class="master-badge">${Number(p.test_count||0)} test</span></td><td><span class="master-badge">${Number(p.untested_count||0)} chưa test</span></td><td><div class="master-actions"><button class="icon-btn" title="Sửa" onclick="editMasterPo(${p.PO_Id})">✎</button><button class="icon-btn danger" title="Xóa" onclick="deleteMasterPo(${p.PO_Id})">×</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="master-empty">Chưa có PO.</td></tr>';
  const clientPages = Math.max(1, Math.ceil(filteredClients.length / MASTER_PAGE_SIZE));
  const poPages = Math.max(1, Math.ceil(filteredPos.length / MASTER_PAGE_SIZE));
  document.getElementById('masterClientPageInfo').textContent = `${filteredClients.length} khách hàng`;
  document.getElementById('masterClientPageLabel').textContent = `${masterClientPage} / ${clientPages}`;
  document.getElementById('masterClientPrev').disabled = masterClientPage <= 1;
  document.getElementById('masterClientNext').disabled = masterClientPage >= clientPages;
  document.getElementById('masterPoPageInfo').textContent = `${filteredPos.length} PO`;
  document.getElementById('masterPoPageLabel').textContent = `${masterPoPage} / ${poPages}`;
  document.getElementById('masterPoPrev').disabled = masterPoPage <= 1;
  document.getElementById('masterPoNext').disabled = masterPoPage >= poPages;
  const opts = masterClients.map(c => `<option value="${c.Cus_id}">${escMaster(c.Cus_Name)}</option>`).join('');
  document.getElementById('masterPoCustomer').innerHTML = opts || '<option value="">Chưa có khách hàng</option>';
  const currentFilter = document.getElementById('masterPoFilter').value;
  document.getElementById('masterPoFilter').innerHTML = '<option value="">Tất cả khách hàng</option>' + opts;
  if(currentFilter && masterClients.some(c => String(c.Cus_id) === String(currentFilter))) document.getElementById('masterPoFilter').value = currentFilter;
}
function openMasterClientForm(edit=false){ document.getElementById('masterClientForm').style.display = 'block'; document.getElementById('masterClientName').focus(); document.getElementById('masterClientSaveBtn').textContent = edit ? 'Cập nhật' : 'Lưu'; }
function resetMasterClientForm(){ masterEditingClientId = null; document.getElementById('masterClientForm').style.display = 'none'; document.getElementById('masterClientName').value = ''; document.getElementById('masterClientMsg').textContent = ''; }
async function saveMasterClient(){
  const name = document.getElementById('masterClientName').value.trim();
  if(!name){ document.getElementById('masterClientMsg').textContent = '⚠ Vui lòng nhập tên khách hàng'; return; }
  try{ await apiJsonMaster(masterEditingClientId ? `${API}/clients/${masterEditingClientId}` : `${API}/clients`, { method: masterEditingClientId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) }); resetMasterClientForm(); await loadMasterData(); await loadClientsAndPos(); }
  catch(e){ document.getElementById('masterClientMsg').textContent = '⚠ ' + e.message; }
}
function editMasterClient(id){ const c = masterClients.find(x => Number(x.Cus_id) === Number(id)); if(!c) return; masterEditingClientId = id; document.getElementById('masterClientName').value = c.Cus_Name; openMasterClientForm(true); }
async function deleteMasterClient(id){ const c = masterClients.find(x => Number(x.Cus_id) === Number(id)); if(!c) return; if(!confirm(`Xóa khách hàng "${c.Cus_Name}"?`)) return; try{ await apiJsonMaster(`${API}/clients/${id}`, { method:'DELETE' }); await loadMasterData(); await loadClientsAndPos(); }catch(e){ alert(e.message); } }
function openMasterPoForm(edit=false){ document.getElementById('masterPoForm').style.display = 'block'; document.getElementById('masterPoSaveBtn').textContent = edit ? 'Cập nhật' : 'Lưu'; document.getElementById('masterPoName').focus(); }
function resetMasterPoForm(){ masterEditingPoId = null; document.getElementById('masterPoForm').style.display = 'none'; document.getElementById('masterPoName').value = ''; document.getElementById('masterPoMsg').textContent = ''; }
async function saveMasterPo(){
  const customer_id = Number(document.getElementById('masterPoCustomer').value);
  const po_number = document.getElementById('masterPoName').value.trim();
  if(!customer_id || !po_number){ document.getElementById('masterPoMsg').textContent = '⚠ Vui lòng chọn khách hàng và nhập PO'; return; }
  try{ await apiJsonMaster(masterEditingPoId ? `${API}/pos/${masterEditingPoId}` : `${API}/pos`, { method: masterEditingPoId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({customer_id,po_number}) }); resetMasterPoForm(); await loadMasterData(); await loadClientsAndPos(); }
  catch(e){ document.getElementById('masterPoMsg').textContent = '⚠ ' + e.message; }
}
function editMasterPo(id){ const p = masterPos.find(x => Number(x.PO_Id) === Number(id)); if(!p) return; masterEditingPoId = id; openMasterPoForm(true); document.getElementById('masterPoCustomer').value = p.Cus_id; document.getElementById('masterPoName').value = p.PO_Name; }
async function deleteMasterPo(id){ const p = masterPos.find(x => Number(x.PO_Id) === Number(id)); if(!p) return; if(!confirm(`Xóa PO "${p.PO_Name}"?`)) return; try{ await apiJsonMaster(`${API}/pos/${id}`, { method:'DELETE' }); await loadMasterData(); await loadClientsAndPos(); }catch(e){ alert(e.message); } }
document.getElementById('masterClientNewBtn').addEventListener('click', () => openMasterClientForm(false));
document.getElementById('masterClientCancelBtn').addEventListener('click', resetMasterClientForm);
document.getElementById('masterClientSaveBtn').addEventListener('click', saveMasterClient);
document.getElementById('masterClientSearch').addEventListener('input', () => { masterClientPage = 1; renderMaster(); });
document.getElementById('masterPoNewBtn').addEventListener('click', () => openMasterPoForm(false));
document.getElementById('masterPoCancelBtn').addEventListener('click', resetMasterPoForm);
document.getElementById('masterPoSaveBtn').addEventListener('click', saveMasterPo);
document.getElementById('masterPoFilter').addEventListener('change', () => { masterPoPage = 1; renderMaster(); });
document.getElementById('masterClientPrev').addEventListener('click', () => { if(masterClientPage > 1){ masterClientPage--; renderMaster(); } });
document.getElementById('masterClientNext').addEventListener('click', () => { const n = Math.max(1, Math.ceil(masterClients.filter(c => { const q = (document.getElementById('masterClientSearch').value||'').toLowerCase().trim(); return !q || String(c.Cus_Name).toLowerCase().includes(q); }).length / MASTER_PAGE_SIZE)); if(masterClientPage < n){ masterClientPage++; renderMaster(); } });
document.getElementById('masterPoPrev').addEventListener('click', () => { if(masterPoPage > 1){ masterPoPage--; renderMaster(); } });
document.getElementById('masterPoNext').addEventListener('click', () => { const cq = Number(document.getElementById('masterPoFilter').value||0); const n = Math.max(1, Math.ceil(masterPos.filter(p => !cq || Number(p.Cus_id) === cq).length / MASTER_PAGE_SIZE)); if(masterPoPage < n){ masterPoPage++; renderMaster(); } });

// ==================== CLOCK ====================
function updateHeaderClock(){
  const el = document.getElementById('dashboardDateTime'); if(!el) return;
  const d = new Date(); const pad = n => String(n).padStart(2,'0');
  el.textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
updateHeaderClock(); setInterval(updateHeaderClock, 1000);

// ==================== HOME DASHBOARD ====================
let homeDashboardLoading = false;
function homePct(v,total){ return total ? `${(Number(v||0)/total*100).toFixed(1)}%` : '0.0%'; }
function homeStatus(v){ const r = String(v||'PENDING').toUpperCase(); return r==='PASS'?'<span class="home-status pass">✓ PASS</span>':r==='FAIL'?'<span class="home-status fail">✕ FAIL</span>':'<span class="home-status pending">◷ Pending</span>'; }

function renderHomeChart(daily){
  const bars = document.getElementById('homeBars');
  const y = document.getElementById('homeYAxis');
  const max = Math.max(1, ...daily.flatMap(x => [+x.pass||0, +x.fail||0, +x.pending||0]));
  const step = niceStep(max, 5);
  const ticks = [];
  for(let v = 0; v <= step * 5; v += step) ticks.push(v);
  const top = ticks[ticks.length - 1] || step;
  y.innerHTML = ticks.slice().reverse().map(v => `<span>${v}</span>`).join('');
  const h = v => `${((+v || 0) / top) * 100}%`;
  bars.innerHTML = daily.map(x => {
    const total = (+x.pass||0) + (+x.fail||0) + (+x.pending||0);
    const empty = total === 0;
    return `<div class="home-day"${empty ? ' style="opacity:.45"' : ''}>
      <div class="home-bar-group">
        <div class="home-bar pass" style="height:${h(x.pass)}" title="Đạt: ${x.pass}" data-tooltip="Đạt: ${x.pass}">${(+x.pass > 0) ? `<span class="home-bar-value">${x.pass}</span>` : ''}</div>
        <div class="home-bar fail" style="height:${h(x.fail)}" title="Không đạt: ${x.fail}" data-tooltip="Không đạt: ${x.fail}">${(+x.fail > 0) ? `<span class="home-bar-value">${x.fail}</span>` : ''}</div>
        <div class="home-bar pending" style="height:${h(x.pending)}" title="Pending: ${x.pending}" data-tooltip="Pending: ${x.pending}">${(+x.pending > 0) ? `<span class="home-bar-value">${x.pending}</span>` : ''}</div>
      </div>
      <span class="home-day-label">${formatVNDate(x.date).slice(0,5)}</span>
    </div>`;
  }).join('');
}

function renderKpiProgress(total, pass, fail, pending){
  const map = [{ sel:'.home-kpi.pass', val:pass, total:total },{ sel:'.home-kpi.fail', val:fail, total:total },{ sel:'.home-kpi.pending', val:pending, total:total },{ sel:'.home-kpi.total', val:total, total:total }];
  map.forEach(({ sel, val, total }) => {
    const card = document.querySelector(sel); if(!card) return;
    card.querySelector('.kpi-progress')?.remove();
    const rateSpan = card.querySelector('.kpi-rate, [id$="Rate"]');
    const pct = total > 0 ? Math.min(100, (Number(val) / Number(total)) * 100) : 0;
    const bar = document.createElement('div');
    bar.className = 'kpi-progress';
    bar.innerHTML = `<div class="kpi-progress-fill" style="width:${pct}%"></div>`;
    card.appendChild(bar);
    if(rateSpan && !rateSpan.classList.contains('kpi-rate')) rateSpan.classList.add('kpi-rate');
  });
}

function renderHomeDonut(total, pass, fail, pending){
  const box = document.getElementById('homeDonutBox'); if(!box) return;
  if(total === 0){
    box.innerHTML = `<div class="chart-empty-state" style="min-height:220px"><div class="ce-icon">🥧</div><div class="ce-title">Chưa có dữ liệu</div><div class="ce-desc">Biểu đồ phân bố sẽ hiển thị khi có kết quả test</div></div>`;
    return;
  }
  const r = 60, cx = 80, cy = 80, circ = 2 * Math.PI * r;
  const segs = [{label:'PASS', val:pass, color:'#45b36b'},{label:'FAIL', val:fail, color:'#ef5350'},{label:'Pending', val:pending, color:'#f5b82e'}];
  let offset = 0;
  const arcs = segs.map(s => { const len = (s.val / total) * circ; const dash = `${len} ${circ - len}`; const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${s.color}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" />`; offset += len; return arc; }).join('');
  box.innerHTML = `<div class="home-donut-wrap"><svg class="home-donut-svg" viewBox="0 0 160 160"><circle cx="${cx}" cy="${cy}" r="${r}" stroke="#EEF2F5" />${arcs}<text x="${cx}" y="${cy}" text-anchor="middle" dy="0.35em" style="font: 700 26px 'Space Grotesk',sans-serif; fill:#26323d; transform: rotate(90deg); transform-origin: ${cx}px ${cy}px;">${total}</text></svg><div class="home-donut-legend">${segs.map(s => `<div class="donut-item"><span class="di-dot" style="background:${s.color}"></span><span class="di-label">${s.label}</span><span class="di-value">${s.val}</span></div>`).join('')}</div></div>`;
}

// ==================== GỘP 2 NGUỒN TEST ====================
// Trả về mảng thống nhất từ cả Nhật ký test đốt và Test hàng mẫu
async function fetchAllTestsNormalized(){
  try{
    const [burnRows, sampleRows] = await Promise.all([
      fetch(`${API}/burn-tests`).then(r => r.json()).catch(() => []),
      fetch(`${API}/sample-tests`).then(r => r.json()).catch(() => [])
    ]);

    const burnList = (Array.isArray(burnRows) ? burnRows : []).map(r => ({
      source: 'burn',
      id: Number(r.Id || r.id || 0),
      po_id: Number(r.PO_Id || r.purchase_order_id || 0),
      po_number: r.po_number || r.PO_Name || '',
      customer_id: Number(r.Cus_Id || r.customer_id || 0),
      customer_name: r.customer_name || r.Cus_Name || '',
      product_code: r.Product_Code || r.product_code || '',
      test_result: String(r.Test_result || r.result || 'PENDING').toUpperCase(),
      test_date: String(r.Test_date || r.test_date || '').slice(0,10),
      start_datetime: r.Start || r.start_datetime || '',
      end_datetime: r.End || r.end_datetime || '',
      total_burn_time: r.Total_Burn_Time || r.total_burn_time || ''
    }));

    const sampleList = (Array.isArray(sampleRows) ? sampleRows : []).map(r => ({
      source: 'sample',
      id: Number(r.id || 0),
      po_id: Number(r.purchase_order_id || 0),
      po_number: r.po_number || '',
      customer_id: Number(r.customer_id || 0),
      customer_name: r.customer_name || '',
      product_code: r.product_name || r.size || 'Mẫu',
      test_result: String(r.test_result || 'PENDING').toUpperCase(),
      test_date: String(r.start_datetime || r.test_date || '').slice(0,10),
      start_datetime: r.start_datetime || '',
      end_datetime: r.end_datetime || '',
      total_burn_time: r.total_burn_time || ''
    }));

    return [...burnList, ...sampleList];
  } catch(_){
    return [];
  }
}


async function loadHomeDashboard(){
  if(homeDashboardLoading) return; homeDashboardLoading = true;
  try{
    const end = new Date(), start = new Date(end); start.setDate(end.getDate() - 6);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const from = iso(start), to = iso(end);

    const [allTests, pos, prodRes] = await Promise.all([
      fetchAllTestsNormalized(),
      fetch(`${API}/pos`).then(r => r.json()).catch(() => []),
      fetch(`${API}/products`).then(r => r.json()).catch(() => [])
    ]);

    // Tính KPI trên toàn bộ
    const total = allTests.length;
    const pass = allTests.filter(t => t.test_result === 'PASS').length;
    const fail = allTests.filter(t => t.test_result === 'FAIL').length;
    const pending = allTests.filter(t => t.test_result === 'PENDING').length;

    const setKpi = (id, val) => { const el = document.getElementById(id); if(!el) return; el.textContent = val; const card = el.closest('.home-kpi'); if(card) card.classList.toggle('is-empty', Number(val) === 0); };
    setKpi('homeTotal', total); setKpi('homePass', pass); setKpi('homeFail', fail); setKpi('homePending', pending);
    document.getElementById('homePassRate').textContent = `Tỷ lệ: ${homePct(pass, total)}`;
    document.getElementById('homeFailRate').textContent = `Tỷ lệ: ${homePct(fail, total)}`;
    document.getElementById('homePendingRate').textContent = `Tỷ lệ: ${homePct(pending, total)}`;
    document.getElementById('homeTotalSub').textContent = `${pos.length || 0} PO đang quản lý`;
    document.getElementById('homeDateLabel').textContent = `Tình hình hệ thống · ${formatVNDate(from)} — ${formatVNDate(to)}`;
    document.getElementById('homeChartRange').textContent = `${formatVNDate(from)} — ${formatVNDate(to)}`;
    renderKpiProgress(total, pass, fail, pending);

    const syncEl = document.getElementById('homeLastSync');
    if(syncEl){ const now = new Date(); const pad = n => String(n).padStart(2,'0'); syncEl.textContent = `Cập nhật lúc ${pad(now.getHours())}:${pad(now.getMinutes())} · ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`; }

    // Lọc 7 ngày + tính daily
    const fromT = `${from}T00:00:00`;
    const toT = `${to}T23:59:59`;
    const recent7d = allTests.filter(t => {
      const d = String(t.test_date || '').slice(0,10);
      return d >= from && d <= to;
    });

    // Tính daily
    const dayMap = {};
    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
      const isoD = iso(d);
      dayMap[isoD] = { date: isoD, total: 0, pass: 0, fail: 0, pending: 0 };
    }
    recent7d.forEach(t => {
      const d = t.test_date;
      if(!d) return;
      if(!dayMap[d]) dayMap[d] = { date: d, total: 0, pass: 0, fail: 0, pending: 0 };
      const x = dayMap[d];
      x.total++;
      if(t.test_result === 'PASS') x.pass++;
      else if(t.test_result === 'FAIL') x.fail++;
      else x.pending++;
    });
    const daily = Object.values(dayMap).sort((a,b) => a.date.localeCompare(b.date));

    // Mini strip
    document.getElementById('mini7dTotal').textContent = recent7d.length;
    document.getElementById('miniPoCount').textContent = pos.length || 0;
    document.getElementById('miniProdCount').textContent = Array.isArray(prodRes) ? prodRes.length : 0;
    document.getElementById('miniPassRate').textContent = total ? `${((pass/total)*100).toFixed(0)}%` : '0%';

    // Chart
    const chartWrap = document.getElementById('homeChartWrap');
    if(total === 0){
      chartWrap.classList.add('has-empty');
      let emptyEl = chartWrap.querySelector('.chart-empty-state');
      if(!emptyEl){ emptyEl = document.createElement('div'); emptyEl.className = 'chart-empty-state'; chartWrap.appendChild(emptyEl); }
      emptyEl.innerHTML = `<div class="ce-icon">📊</div><div class="ce-title">Chưa có dữ liệu test</div><div class="ce-desc">Hãy nhập hoặc import dữ liệu để xem biểu đồ</div><a class="ce-cta" href="#" onclick="switchView('tests');return false">＋ Nhập test đầu tiên</a>`;
      if(typeof homeChartInstance !== 'undefined' && homeChartInstance){ homeChartInstance.destroy(); homeChartInstance = null; }
    } else {
      chartWrap.classList.remove('has-empty');
      const emptyEl = chartWrap.querySelector('.chart-empty-state'); if(emptyEl) emptyEl.remove();
      renderHomeChart(daily);
    }
    renderHomeDonut(total, pass, fail, pending);

    // Test gần đây (8 mới nhất)
    const recentBody = document.getElementById('homeRecentBody');
    const sorted = [...allTests].sort((a,b) => {
      const da = a.start_datetime || a.test_date || '';
      const db = b.start_datetime || b.test_date || '';
      return String(db).localeCompare(String(da));
    });
    if(sorted.length === 0){
      recentBody.innerHTML = `<tr><td colspan="7"><div class="table-empty-state"><div class="te-icon">📋</div><div class="te-title">Chưa có bản ghi test nào</div><div class="te-desc">Bắt đầu bằng cách nhập kết quả test</div></div></td></tr>`;
    } else {
      const recent = sorted.slice(0, 8);
      recentBody.innerHTML = recent.map(r => {
        const badge = r.source === 'sample'
          ? '<span class="src-badge sample">🕯️ Mẫu</span>'
          : '<span class="src-badge burn">🔥 Đốt</span>';
        const link = r.source === 'sample'
          ? `onclick="openSamplePhotoViewer(${r.id});return false"`
          : `onclick="editRow(${r.id});return false"`;
        return `<tr>
          <td>${homeEscape(formatVNDate(r.test_date))}</td>
          <td>${homeEscape(r.po_number || '—')}</td>
          <td class="left">
            <span class="home-link-wrap">
              <a class="home-link home-recent-link" href="#" data-id="${r.id}" data-source="${r.source || 'burn'}" ${link}>${homeEscape(r.product_code || '—')}</a>
              <span class="home-link-thumb"><img src="" data-home-preview="${r.id}" alt="Preview ${homeEscape(r.product_code || 'mã hàng')}" onerror="this.parentElement.style.display='none'"></span>
            </span>
          </td>
          <td class="left">${homeEscape(r.customer_name || '—')}</td>
          <td class="mono">${homeEscape(r.total_burn_time || '—')}</td>
          <td>${badge}</td>
          <td>${homeStatus(r.test_result)}</td>
        </tr>`;
      }).join('');
    }

    // Tổng quan theo PO
    const poMap = {};
    allTests.forEach(r => {
      const id = r.po_id || 0;
      const name = r.po_number || `PO #${id}`;
      if(!poMap[id]) poMap[id] = { name, total:0, pass:0, fail:0, pending:0, last:'' };
      const x = poMap[id]; x.total++;
      if(r.test_result === 'PASS') x.pass++; else if(r.test_result === 'FAIL') x.fail++; else x.pending++;
      if(String(r.test_date) > String(x.last)) x.last = r.test_date;
    });
    const poRows = Object.values(poMap).sort((a,b) => String(b.last).localeCompare(String(a.last))).slice(0, 5);
    document.getElementById('homePoBody').innerHTML = poRows.length
      ? poRows.map(x => `<tr><td class="left"><b>${homeEscape(x.name)}</b></td><td>${x.total}</td><td style="color:#329b58;font-weight:600">${x.pass}</td><td style="color:#e33f3c;font-weight:600">${x.fail}</td><td>${homePct(x.pass,x.total)}</td></tr>`).join('')
      : `<tr><td colspan="5"><div class="table-empty-state" style="padding:22px"><div class="te-icon" style="font-size:28px">📦</div><div class="te-desc">Chưa có PO nào có test</div></div></td></tr>`;

    // Alerts
    const alerts = [];
    if(pending) alerts.push(`<div class="home-alert warn"><div class="aicon">◷</div><div><b>${pending} test đang Pending</b><span>Cần hoàn thành và cập nhật kết quả.</span></div></div>`);
    if(fail) alerts.push(`<div class="home-alert fail"><div class="aicon">✕</div><div><b>${fail} test Không đạt</b><span>Kiểm tra nguyên nhân và xử lý CAPA nếu cần.</span></div></div>`);
    if(!pending && !fail && total > 0) alerts.push(`<div class="home-alert info"><div class="aicon">✓</div><div><b>Không có cảnh báo tồn đọng</b><span>Tất cả kết quả hiện tại đang được kiểm soát.</span></div></div>`);
    if(total === 0) alerts.push(`<div class="home-alert info"><div class="aicon">i</div><div><b>Chưa có dữ liệu test</b><span>Hãy nhập hoặc import dữ liệu để bắt đầu.</span></div></div>`);
    document.getElementById('homeAlerts').innerHTML = alerts.join('');
  }catch(err){
    console.error('Home dashboard:', err);
    document.getElementById('homeAlerts').innerHTML = `<div class="home-alert fail"><div class="aicon">!</div><div><b>Không tải được Dashboard</b><span>${homeEscape(err.message)}</span></div></div>`;
  } finally { homeDashboardLoading = false; }
} 	

// ==================== PHOTOS ====================
async function loadPhotoGallery(){
  const box = document.getElementById('photoGallery'); box.innerHTML = '<div class="module-empty">Đang tải...</div>';
  try{
    const rows = await fetch(`${API}/burn-tests`).then(r => r.json());
    const searchText = (document.getElementById('photoSearchInput')?.value || '').trim().toLowerCase();

    const data = (Array.isArray(rows) ? rows : []).filter(r => {
      const photos = [1,2,3,4,5].filter(i => r['PIC_'+i]);
      if(!photos.length) return false;
      const haystack = [
        r.po_number || r.PO_Name || '',
        r.product_code || r.Product_Code || '',
        r.customer_name || r.Cus_Name || '',
        r.Test_result || r.test_result || '',
        r.Total_Burn_Time || '',
        r.Temperature || ''
      ].join(' ').toLowerCase();
      return !searchText || haystack.includes(searchText);
    });

    document.getElementById('photoGalleryCount').textContent = `${data.length} test có ảnh`;

    box.innerHTML = data.length
      ? data.map(r => {
          const pics  = [1,2,3,4,5].filter(i => r['PIC_'+i]);
          const first = r['PIC_'+pics[0]];
          const code  = homeEscape(r.Product_Code || r.product_code || '—');

          // ✅ Xác định trạng thái
          const result = String(r.Test_result || r.test_result || 'PENDING').toUpperCase();
          const cls    = result === 'PASS' ? 'pass' : result === 'FAIL' ? 'fail' : 'pending';
          const label  = result === 'PASS' ? 'PASS' : result === 'FAIL' ? 'FAIL' : 'PENDING';

          return `<div class="photo-card" onclick="openImageModal(${Number(r.Id||r.id)})">
            <div class="photo-thumb">
              <span class="photo-status-badge ${cls}">${label}</span>
              <img src="${first}" loading="lazy" alt="${code}"
                   onerror="this.style.display='none';this.parentElement.innerHTML='<div class=photo-placeholder>▧</div>'">
            </div>
            <div class="photo-meta">
              <b>${code}</b>
              <span>PO: ${homeEscape(r.po_number||r.PO_Name||'—')}</span>
              <span>${homeEscape(r.customer_name||r.Cus_Name||'—')} · <span class="photo-count">${pics.length}/5 ảnh</span></span>
            </div>
          </div>`;
        }).join('')
      : '<div class="module-empty">Không tìm thấy test có ảnh phù hợp.</div>';
  }catch(e){
    box.innerHTML = `<div class="module-empty">Không tải được gallery: ${homeEscape(e.message)}</div>`;
  }
}

// ==================== SAMPLE ====================
let sampleCustomers = [], samplePOs = [], sampleTests = [];
function sampleEsc(v){ return homeEscape(v == null ? '' : v); }
async function loadSampleRefs(){
  const c = document.getElementById('sampleCustomer');
  const po = document.getElementById('samplePO');
  if(c) c.innerHTML = '<option value="">Đang tải khách hàng...</option>';
  if(po) po.innerHTML = '<option value="">Đang tải đơn hàng...</option>';
  try{
    const r = await fetch(`${API}/sample-tests/refs`, { cache:'no-store' });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'Không tải được dữ liệu');
    sampleCustomers = Array.isArray(d.customers) ? d.customers : [];
    samplePOs = Array.isArray(d.purchase_orders) ? d.purchase_orders : [];
    if(c){ c.innerHTML = '<option value="">-- Chọn khách hàng --</option>' + sampleCustomers.map(x => `<option value="${x.id}">${sampleEsc(x.name)}</option>`).join('') || '<option value="">Chưa có khách hàng</option>'; c.onchange = filterSamplePOs; }
    filterSamplePOs();
  }catch(e){ if(c) c.innerHTML = '<option value="">Không tải được khách hàng</option>'; if(po) po.innerHTML = '<option value="">Không tải được đơn hàng</option>'; }
}
function filterSamplePOs(){
  const cid = document.getElementById('sampleCustomer')?.value;
  const sel = document.getElementById('samplePO'); if(!sel) return;
  const rows = cid ? samplePOs.filter(x => String(x.customer_id) === String(cid)) : samplePOs;
  sel.innerHTML = '<option value="">-- Chọn PO / Đơn hàng --</option>' + rows.map(x => `<option value="${x.id}">${sampleEsc(x.po_number||'')} — ${sampleEsc(x.customer_name||'')}</option>`).join('') || '<option value="">Chưa có PO</option>';
}
function openSampleModal(row=null){
  document.getElementById('sampleModal').classList.add('show');
  initSampleDropZone();
  document.getElementById('sampleMsg').textContent = ''; document.getElementById('sampleMsg').className = 'msg';
  document.getElementById('sampleId').value = row?.id || '';
  document.getElementById('sampleProductName').value = row?.product_name || row?.size || '';
  document.getElementById('sampleWick').value = row?.wick_spec || '';
  const customerEl = document.getElementById('sampleCustomer');
  customerEl.value = row?.customer_id || '';
  filterSamplePOs();
  document.getElementById('samplePO').value = row?.purchase_order_id || '';

  // Các field mới
  document.getElementById('sampleStart').value = row?.start_datetime || '';
  document.getElementById('sampleEnd').value = row?.end_datetime || '';
  document.getElementById('sampleBurnTime').value = row?.total_burn_time || '';
  document.getElementById('sampleTester').value = row?.tester || '';
  document.getElementById('sampleApproved').value = row?.approved || '';
  document.getElementById('sampleNotes').value = row?.note || '';
  document.getElementById('sampleResult').value = (row?.test_result || 'PENDING').toUpperCase();

  const persistedRunning = Number(row?.is_running ?? 0) === 1;
  const persistedPhase = String(row?.current_phase || 'BURN').toUpperCase();
  const persistedStartedAt = row?.phase_started_at || null;
  const persistedTotalSeconds = Number(row?.burn_total_seconds ?? parseSampleBurnTime(row?.total_burn_time || ''));

  sampleCycleState = {
    totalBurnSeconds: Number.isFinite(persistedTotalSeconds) ? persistedTotalSeconds : parseSampleBurnTime(row?.total_burn_time || ''),
    phase: ['BURN','REST'].includes(persistedPhase) ? persistedPhase : 'BURN',
    phaseElapsed: 0,
    cycleNo: 0,
    running: persistedRunning,
    lastTick: null,
    segments: Array.isArray(row?.cycles) ? row.cycles : [],
    currentPhaseStartedAt: persistedStartedAt || new Date().toISOString()
  };

  if(sampleCycleState.running && persistedStartedAt){
    const startMs = new Date(persistedStartedAt).getTime();
    const nowMs = Date.now();
    const elapsed = Math.max(0, Math.round((nowMs - startMs) / 1000));
    if(sampleCycleState.phase === 'BURN'){
      sampleCycleState.totalBurnSeconds += elapsed;
      sampleCycleState.phaseElapsed = elapsed % SAMPLE_BURN_CYCLE_SECONDS;
    } else {
      sampleCycleState.phaseElapsed = elapsed % SAMPLE_REST_SECONDS;
    }
  }

  if(sampleCycleState.totalBurnSeconds > 0){
    const cycleCount = Math.floor(sampleCycleState.totalBurnSeconds / SAMPLE_BURN_CYCLE_SECONDS);
    sampleCycleState.cycleNo = cycleCount;
  }

  if(sampleCycleState.running && !sampleCycleTimerHandle){
    sampleCycleTimerHandle = setInterval(() => {
      tickSampleCycleTimer();
      persistSampleTimerState();
    }, 1000);
  }

  document.getElementById('sampleModalTitle').textContent = row ? 'Sửa test hàng mẫu gửi khách' : 'Tạo test đốt hàng mẫu gửi khách';
  renderSamplePhotoGrid(row?.photos||[]);
  syncSampleCycleUI();
}
function closeSampleModal(){
  if(sampleCycleTimerHandle){ clearInterval(sampleCycleTimerHandle); sampleCycleTimerHandle = null; }
  sampleCycleState = { totalBurnSeconds: 0, phase: 'BURN', phaseElapsed: 0, cycleNo: 0, running: false, lastTick: null };
  document.getElementById('sampleModal').classList.remove('show');
  syncSampleCycleUI();
}
function renderSamplePhotoGrid(photos=[]){
  const box = document.getElementById('samplePhotoGrid');
  const list = [...(photos||[])].sort((a,b) => Number(a.slot) - Number(b.slot));
  document.getElementById('samplePhotoCount').textContent = `${list.length} ảnh`;
  box.innerHTML = '';
  list.forEach(ph => {
    const slot = Number(ph.slot);
    const div = document.createElement('div');
    div.className = 'sample-photo-slot';
    div.dataset.slot = slot;
    div.innerHTML = `<img src="${sampleEsc(ph.file_url)}?t=${Date.now()}" alt="Ảnh ${slot}" loading="lazy"><span class="slot-label">Ảnh ${slot} · click để đổi</span><button type="button" class="sample-photo-delete" title="Xóa ảnh" onclick="event.stopPropagation();deleteSamplePhoto(${slot})">✕</button>`;
    div.onclick = () => chooseSamplePhoto(slot);
    box.appendChild(div);
  });
  const add = document.createElement('div');
  add.className = 'sample-photo-slot sample-photo-add';
  add.innerHTML = '<div class="slot-empty">📷<br>Chụp ảnh tiếp</div><span class="slot-label">＋ Thêm ảnh</span>';
  add.onclick = () => captureSamplePhoto();
  box.appendChild(add);
}
async function uploadSamplePhotoFile(id, file, slot=null){
  if(!id || !file) return;
  const fd = new FormData();
  const optimized = await compressImageForUpload(file);
  fd.append('photo', optimized, optimized.name || 'sample.jpg');
  if(slot) fd.append('slot', String(slot));
  const r = await fetch(`${API}/sample-tests/${id}/photos`, { method:'POST', body:fd });
  const d = await r.json();
  if(!r.ok) throw new Error(d.error || 'Tải ảnh thất bại');
  renderSamplePhotoGrid(d.photos||[]);
  await loadSampleTests();
  return d;
}
async function chooseSamplePhoto(slot){
  const id = Number(document.getElementById('sampleId').value);
  if(!id){ alert('Vui lòng lưu hồ sơ test trước.'); return; }
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/jpg';
  input.onchange = async () => { if(!input.files[0]) return; try{ await uploadSamplePhotoFile(id, input.files[0], slot); }catch(e){ alert('✕ ' + e.message); } };
  input.click();
}
function captureSamplePhoto(){ const id = Number(document.getElementById('sampleId').value); if(!id){ alert('Vui lòng lưu hồ sơ test trước.'); return; } const input = document.getElementById('sampleCameraInput'); input.value = ''; input.click(); }
function chooseSampleFiles(){ const id = Number(document.getElementById('sampleId').value); if(!id){ alert('Vui lòng lưu hồ sơ test trước.'); return; } const input = document.getElementById('sampleFilesInput'); input.value = ''; input.click(); }
async function uploadSamplePhotoFiles(files){
  const id = Number(document.getElementById('sampleId').value);
  if(!id){ alert('Vui lòng lưu hồ sơ test trước.'); return; }
  const list = [...files].filter(f => /^image\/(jpeg|png|webp|jpg)$/i.test(f.type));
  if(!list.length){ alert('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.'); return; }
  for(const file of list){ try{ await uploadSamplePhotoFile(id, file, null); }catch(err){ alert('✕ ' + err.message); } }
}
function initSampleDropZone(){
  const drop = document.getElementById('sampleDropZone');
  if(!drop || drop.dataset.ready === '1') return;
  drop.dataset.ready = '1';
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover','dragleave','drop'].forEach(ev => drop.addEventListener(ev, stop));
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, () => drop.classList.add('is-dragover')));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-dragover')));
  drop.addEventListener('drop', e => uploadSamplePhotoFiles(e.dataTransfer.files));
  drop.addEventListener('click', chooseSampleFiles);
  drop.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); chooseSampleFiles(); } });
}
async function deleteSamplePhoto(slot){
  const id = Number(document.getElementById('sampleId').value); if(!id) return;
  if(!confirm(`Xóa ảnh ${slot}?`)) return;
  const r = await fetch(`${API}/sample-tests/${id}/photos/${slot}`, { method:'DELETE' });
  if(!r.ok){ const d = await r.json().catch(() => ({})); return alert(d.error || 'Xóa ảnh thất bại'); }
  const d = await fetch(`${API}/sample-tests/${id}`).then(x => x.json());
  renderSamplePhotoGrid(d.photos||[]);
  await loadSampleTests();
}
document.getElementById('sampleCameraInput')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if(!file) return; const id = Number(document.getElementById('sampleId').value); try{ await uploadSamplePhotoFile(id, file, null); }catch(err){ alert('✕ ' + err.message); } });
document.getElementById('sampleFilesInput')?.addEventListener('change', async e => { const files = [...(e.target.files||[])]; if(!files.length) return; await uploadSamplePhotoFiles(files); e.target.value = ''; });
document.getElementById('sampleCycleStartBtn')?.addEventListener('click', () => startSampleCycleTimer());
document.getElementById('sampleCyclePauseBtn')?.addEventListener('click', () => stopSampleCycleTimer());
document.getElementById('sampleCycleResetBtn')?.addEventListener('click', () => resetSampleCycleTimer());
document.getElementById('sampleCycleApplyBtn')?.addEventListener('click', () => { applySampleCycleToInput(); const total = document.getElementById('sampleBurnTime'); if(total) total.focus(); });
const SAMPLE_BURN_CYCLE_SECONDS = 4 * 60 * 60;
const SAMPLE_REST_SECONDS = 1 * 60 * 60;
let sampleCycleTimerHandle = null;
let sampleCycleState = {
  totalBurnSeconds: 0,
  phase: 'BURN',
  phaseElapsed: 0,
  cycleNo: 0,
  running: false,
  lastTick: null,
  segments: [],
  currentPhaseStartedAt: null
};

function buildSampleCycleSegmentsList(){
  if(!Array.isArray(sampleCycleState.segments) || !sampleCycleState.segments.length) return [];
  return sampleCycleState.segments
    .filter(seg => String(seg.phase || 'BURN').toUpperCase() === 'BURN')
    .map((seg, idx) => ({
      cycle_no: Number(seg.cycle_no ?? seg.cycleNo ?? idx + 1),
      phase: 'BURN',
      start_at: seg.start_at || seg.startAt || new Date().toISOString(),
      end_at: seg.end_at || seg.endAt || seg.start_at || seg.startAt || new Date().toISOString(),
      duration_seconds: Math.max(0, Math.round(Number(seg.duration_seconds ?? seg.durationSeconds ?? 0)))
    }));
}

function formatSampleDuration(totalSeconds){
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseSampleBurnTime(rawValue){
  const value = String(rawValue ?? '').trim();
  if(!value) return 0;
  const normalized = value.replace(/,/g, '.').replace(/\s*giờ\s*/gi, 'h').replace(/\s*phút\s*/gi, 'm').replace(/\s*giây\s*/gi, 's');
  if(/^\d+\s*:\s*\d{1,2}(?::\s*\d{1,2})?$/.test(normalized)){
    const parts = normalized.split(':').map(part => Number(part));
    if(parts.length === 2) return (parts[0] * 3600) + (parts[1] * 60);
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/i);
  if(hMatch) return Number(hMatch[1]) * 3600;
  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/i);
  if(mMatch) return Number(mMatch[1]) * 60;
  const sMatch = normalized.match(/(\d+(?:\.\d+)?)\s*s/i);
  if(sMatch) return Number(sMatch[1]);
  const plain = Number(normalized.replace(/[^\d.]/g, ''));
  if(!Number.isNaN(plain)) return plain * 3600;
  return 0;
}

function syncSampleCycleUI(){
  const phaseText = document.getElementById('sampleCyclePhaseText');
  const phaseCounter = document.getElementById('sampleCycleCounter');
  const totalEl = document.getElementById('sampleCycleTotal');
  const currentEl = document.getElementById('sampleCycleCurrent');
  const remainingEl = document.getElementById('sampleCycleRemaining');
  const startBtn = document.getElementById('sampleCycleStartBtn');
  const pauseBtn = document.getElementById('sampleCyclePauseBtn');
  const resetBtn = document.getElementById('sampleCycleResetBtn');
  if(!phaseText || !phaseCounter || !totalEl || !currentEl || !remainingEl) return;

  const totalBurn = sampleCycleState.totalBurnSeconds;
  const currentLimit = sampleCycleState.phase === 'BURN' ? SAMPLE_BURN_CYCLE_SECONDS : SAMPLE_REST_SECONDS;
  const remaining = Math.max(0, currentLimit - sampleCycleState.phaseElapsed);

  phaseText.textContent = sampleCycleState.running
    ? (sampleCycleState.phase === 'BURN' ? 'Đang đốt chu kỳ' : 'Nghỉ giữa chu kỳ')
    : (sampleCycleState.phase === 'BURN' ? 'Chuẩn bị đốt' : 'Đang nghỉ');
  phaseCounter.textContent = `${sampleCycleState.cycleNo} chu kỳ`;
  totalEl.textContent = formatSampleDuration(totalBurn);
  currentEl.textContent = sampleCycleState.phase === 'BURN' ? 'Đốt 4h' : 'Nghỉ 1h';
  remainingEl.textContent = formatSampleDuration(remaining);
  document.getElementById('sampleBurnTime').value = formatSampleDuration(totalBurn);

  if (startBtn) startBtn.style.display = sampleCycleState.running ? 'none' : 'inline-block';
  if (pauseBtn) pauseBtn.style.display = sampleCycleState.running ? 'inline-block' : 'none';
  if (resetBtn) resetBtn.style.display = sampleCycleState.running ? 'inline-block' : 'inline-block';
}

async function persistSampleTimerState(){
  const sampleId = Number(document.getElementById('sampleId').value || 0);
  if(!sampleId) return;
  const payload = {
    is_running: sampleCycleState.running ? 1 : 0,
    current_phase: sampleCycleState.phase,
    phase_started_at: sampleCycleState.currentPhaseStartedAt || new Date().toISOString(),
    total_burn_seconds: Math.max(0, Math.round(sampleCycleState.totalBurnSeconds || 0)),
    total_burn_time: formatSampleDuration(sampleCycleState.totalBurnSeconds || 0)
  };
  try {
    await fetch(`${API}/sample-tests/${sampleId}/timer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_e) {
    // silent fail: timer state is best-effort and should not block UI
  }
}

function stopSampleCycleTimer(){
  if(sampleCycleTimerHandle){ clearInterval(sampleCycleTimerHandle); sampleCycleTimerHandle = null; }
  sampleCycleState.running = false;
  sampleCycleState.lastTick = null;
  const endInput = document.getElementById('sampleEnd');
  if(endInput && !endInput.value) {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    endInput.value = local.toISOString().slice(0, 16);
  }
  persistSampleTimerState();
  syncSampleCycleUI();
}

function recordSampleCycleSegment(phase, startAt, endAt, durationSeconds){
  if(!phase || !startAt || !endAt) return;
  const normalizedPhase = String(phase).toUpperCase();
  if(normalizedPhase !== 'BURN') return;
  const secs = Math.max(0, Math.round(Number(durationSeconds) || 0));
  if(!secs) return;
  const record = {
    cycle_no: sampleCycleState.cycleNo || 1,
    phase: 'BURN',
    start_at: new Date(startAt).toISOString(),
    end_at: new Date(endAt).toISOString(),
    duration_seconds: secs
  };
  sampleCycleState.segments.push(record);
}

function finalizeCurrentSampleCycleSegment(){
  if(!sampleCycleState.currentPhaseStartedAt) return;
  const now = new Date();
  const durationSeconds = Math.max(0, Math.round((now.getTime() - new Date(sampleCycleState.currentPhaseStartedAt).getTime()) / 1000));
  if(durationSeconds > 0){
    recordSampleCycleSegment(sampleCycleState.phase, sampleCycleState.currentPhaseStartedAt, now, durationSeconds);
  }
  sampleCycleState.currentPhaseStartedAt = null;
}

function tickSampleCycleTimer(){
  if(!sampleCycleState.running) return;
  const now = Date.now();
  if(!sampleCycleState.lastTick) sampleCycleState.lastTick = now;
  const elapsed = Math.max(0, (now - sampleCycleState.lastTick) / 1000);
  sampleCycleState.lastTick = now;

  if(!sampleCycleState.currentPhaseStartedAt) {
    sampleCycleState.currentPhaseStartedAt = new Date(now).toISOString();
  }

  if(sampleCycleState.phase === 'BURN'){
    sampleCycleState.phaseElapsed += elapsed;
    sampleCycleState.totalBurnSeconds += elapsed;
    if(sampleCycleState.phaseElapsed >= SAMPLE_BURN_CYCLE_SECONDS){
      recordSampleCycleSegment('BURN', sampleCycleState.currentPhaseStartedAt, new Date(now).toISOString(), SAMPLE_BURN_CYCLE_SECONDS);
      sampleCycleState.cycleNo += 1;
      sampleCycleState.phase = 'REST';
      sampleCycleState.phaseElapsed = 0;
      sampleCycleState.currentPhaseStartedAt = new Date(now).toISOString();
      document.getElementById('sampleStart')?.dispatchEvent(new Event('change'));
    }
  } else {
    sampleCycleState.phaseElapsed += elapsed;
    if(sampleCycleState.phaseElapsed >= SAMPLE_REST_SECONDS){
      sampleCycleState.phase = 'BURN';
      sampleCycleState.phaseElapsed = 0;
      sampleCycleState.currentPhaseStartedAt = new Date(now).toISOString();
    }
  }

  syncSampleCycleUI();
}

function startSampleCycleTimer(){
  if(sampleCycleState.running) return;
  sampleCycleState.running = true;
  sampleCycleState.lastTick = Date.now();
  sampleCycleState.currentPhaseStartedAt = sampleCycleState.currentPhaseStartedAt || new Date().toISOString();
  const startInput = document.getElementById('sampleStart');
  if(startInput && !startInput.value){
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    startInput.value = local.toISOString().slice(0, 16);
  }
  if(!sampleCycleTimerHandle) sampleCycleTimerHandle = setInterval(() => {
    tickSampleCycleTimer();
    persistSampleTimerState();
  }, 1000);
  persistSampleTimerState();
  syncSampleCycleUI();
}

function resetSampleCycleTimer(){
  if(sampleCycleTimerHandle){ clearInterval(sampleCycleTimerHandle); sampleCycleTimerHandle = null; }
  sampleCycleState = {
    totalBurnSeconds: 0,
    phase: 'BURN',
    phaseElapsed: 0,
    cycleNo: 0,
    running: false,
    lastTick: null,
    segments: [],
    currentPhaseStartedAt: null
  };
  document.getElementById('sampleBurnTime').value = '';
  syncSampleCycleUI();
}

function applySampleCycleToInput(){
  const value = formatSampleDuration(sampleCycleState.totalBurnSeconds);
  document.getElementById('sampleBurnTime').value = value;
}

async function saveSampleTest(){
  const msg = document.getElementById('sampleMsg');
  msg.textContent = ''; msg.className = 'msg';
  if(sampleCycleState.running && sampleCycleState.currentPhaseStartedAt){
    const now = new Date();
    const finalSeconds = Math.max(0, Math.round((now.getTime() - new Date(sampleCycleState.currentPhaseStartedAt).getTime()) / 1000));
    if(finalSeconds > 0){
      recordSampleCycleSegment(sampleCycleState.phase, sampleCycleState.currentPhaseStartedAt, now, finalSeconds);
    }
    sampleCycleState.currentPhaseStartedAt = null;
    sampleCycleState.running = false;
    if(sampleCycleTimerHandle){ clearInterval(sampleCycleTimerHandle); sampleCycleTimerHandle = null; }
  }
  const totalBurnValue = document.getElementById('sampleBurnTime').value.trim();
  applySampleCycleToInput();
  const payload = {
    customer_id: document.getElementById('sampleCustomer').value || null,
    purchase_order_id: document.getElementById('samplePO').value || null,
    product_name: document.getElementById('sampleProductName').value.trim(),
    wick_spec: document.getElementById('sampleWick').value.trim(),
    start_datetime: document.getElementById('sampleStart').value || null,
    end_datetime: document.getElementById('sampleEnd').value || null,
    total_burn_time: totalBurnValue || formatSampleDuration(sampleCycleState.totalBurnSeconds) || null,
    tester: document.getElementById('sampleTester').value.trim() || null,
    approved: document.getElementById('sampleApproved').value.trim() || null,
    note: document.getElementById('sampleNotes').value.trim() || null,
    test_result: document.getElementById('sampleResult').value || 'PENDING',
    cycle_segments: buildSampleCycleSegmentsList()
  };
  if(!payload.purchase_order_id){ msg.className = 'msg err show'; msg.textContent = 'PO / Đơn hàng là bắt buộc.'; return; }
  if(!payload.product_name){ msg.className = 'msg err show'; msg.textContent = 'Quy cách là bắt buộc.'; return; }
  if(!payload.wick_spec){ msg.className = 'msg err show'; msg.textContent = 'Bấc là bắt buộc.'; return; }
  try{
    const id = document.getElementById('sampleId').value;
    const r = await fetch(`${API}/sample-tests${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'Lưu thất bại');
    document.getElementById('sampleId').value = d.id;
    msg.className = 'msg ok show'; msg.textContent = '✓ Đã lưu. Có thể tải ảnh và xuất báo cáo.';
    await loadSampleTests(); renderSamplePhotoGrid(d.photos||[]);
  }catch(e){ msg.className = 'msg err show'; msg.textContent = '✕ ' + e.message; }
}// ==================== SAMPLE — PAGINATION ====================
let sampleLastLoadedRows = [];
let sampleCurrentPage = 1;
const SAMPLE_PAGE_SIZE = 10;

async function loadSampleTests(){
  try{
    const q = document.getElementById('sampleSearch')?.value.trim() || '';
    const rows = await fetch(`${API}/sample-tests${q ? '?q=' + encodeURIComponent(q) : ''}`).then(r => r.json());
    sampleTests = rows;
    sampleLastLoadedRows = Array.isArray(rows) ? rows : [];
    sampleCurrentPage = 1;
    renderSamplePage();
  }catch(e){
    document.getElementById('sampleListBody').innerHTML =
      `<tr><td colspan="7" class="module-empty">Lỗi tải dữ liệu: ${sampleEsc(e.message)}</td></tr>`;
  }
}

function renderSamplePage(){
  const rows = sampleLastLoadedRows;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / SAMPLE_PAGE_SIZE));

  if(sampleCurrentPage > totalPages) sampleCurrentPage = totalPages;
  if(sampleCurrentPage < 1) sampleCurrentPage = 1;

  const start = (sampleCurrentPage - 1) * SAMPLE_PAGE_SIZE;
  const pageRows = rows.slice(start, start + SAMPLE_PAGE_SIZE);

  document.getElementById('sampleSummary').textContent = `${total} hồ sơ`;
  document.getElementById('sampleCountLabel').textContent = `${total} hồ sơ`;
  document.getElementById('samplePageLabel').textContent = `${sampleCurrentPage} / ${totalPages}`;
  document.getElementById('samplePrevBtn').disabled = sampleCurrentPage <= 1;
  document.getElementById('sampleNextBtn').disabled = sampleCurrentPage >= totalPages;

  const b = document.getElementById('sampleListBody');
const displayDate = (x) => {
  const s = String(x.start_datetime || '').trim();
  if(s) return s.slice(0,10);
  return x.test_date || '—';
};
  const firstSamplePhoto = (x) => {
    const photos = Array.isArray(x?.photos) ? x.photos : [];
    const first = photos.find(p => p && (p.file_url || p.url || p.image_url)) || null;
    return first ? (first.file_url || first.url || first.image_url) : '';
  };

  function getLastPhotoFromBurnRecord(r){
    if(!r) return '';
    const photoSlots = getPhotoSlots(r);
    let lastUrl = '';
    let lastSlot = -1;
    for(const slot of photoSlots){
      const url = r[slot];
      if(url){
        const num = Number(String(slot).match(/\d+$/)?.[0] || 0);
        if(num > lastSlot){ lastSlot = num; lastUrl = url; }
      }
    }
    if(!lastUrl && Array.isArray(r.photos)){
      const photos = [...r.photos].sort((a,b) => Number(b.slot || 0) - Number(a.slot || 0));
      const first = photos.find(p => p && (p.file_url || p.url || p.image_url)) || null;
      lastUrl = first ? (first.file_url || first.url || first.image_url) : '';
    }
    return lastUrl;
  }

  async function loadSampleFirstPhotoPreview(sampleId, thumbEl, imgEl){
    if(!sampleId || !thumbEl || !imgEl) return;
    if(imgEl.dataset.loaded === '1') return;
    try{
      const r = await fetch(`${API}/sample-tests/${sampleId}`, { cache: 'no-store' });
      const d = await r.json();
      if(!r.ok) throw new Error(d.error || 'Không tải được ảnh mẫu');
      const photos = Array.isArray(d.photos) ? d.photos : [];
      const first = photos.find(p => p && (p.file_url || p.url || p.image_url)) || null;
      const src = first ? (first.file_url || first.url || first.image_url) : '';
      if(!src){ thumbEl.style.display = 'none'; imgEl.dataset.loaded = '1'; return; }
      imgEl.src = src;
      thumbEl.style.display = 'block';
      imgEl.dataset.loaded = '1';
    }catch(_){
      thumbEl.style.display = 'none';
      imgEl.dataset.loaded = '1';
    }
  }

  const stamp = (v) => {
    const r = String(v||'PENDING').toUpperCase();
    if(r === 'PASS') return '<span class="stamp pass">PASS</span>';
    if(r === 'FAIL') return '<span class="stamp fail">FAIL</span>';
    return '<span class="stamp pending">PENDING</span>';
  };
  const fmtDT = (v) => {
    if(!v) return '—';
    return String(v).replace('T',' ').slice(0,16);
  };

  b.innerHTML = pageRows.length ? pageRows.map(x => {
    const sampleThumb = firstSamplePhoto(x);
    return `
    <tr>
      <td>${sampleEsc(displayDate(x))}</td>
      <td class="left">${sampleEsc(x.customer_name||'—')}</td>
      <td>
        <div class="sample-po-wrap">
          <button type="button" class="sample-po-link" data-sample-id="${x.id}" title="Bấm để xem ảnh"
                  onclick="event.stopPropagation();openSamplePhotoViewer(${x.id})">
            ${sampleEsc(x.po_number||'—')}
          </button>
          <div class="sample-po-thumb" style="${sampleThumb ? '' : 'display:none'}">
            <img src="${sampleThumb || ''}" data-sample-img="${x.id}" alt="${sampleEsc(x.po_number||'PO')}" onerror="this.parentElement.style.display='none'">
          </div>
        </div>
      </td>
      <td class="left">${sampleEsc(x.product_name||x.size||'—')}</td>
      <td>${sampleEsc(x.wick_spec||'—')}</td>
      <td class="sample-dt">${fmtDT(x.start_datetime)}</td>
      <td class="sample-dt">${fmtDT(x.end_datetime)}</td>
      <td class="sample-dt">${sampleEsc(x.total_burn_time||'—')}</td>
      <td class="quick-result-cell sample-result-cell" data-id="${x.id}" data-result="${x.test_result||'PENDING'}" title="Bấm để đổi kết quả">${stamp(x.test_result)}</td>
      <td>${x.photo_count||0} ảnh</td>
      <td>
        <button class="icon-btn" title="Sửa"
                onclick='openSampleModal(${JSON.stringify(x).replace(/'/g,"&#39;")})'>✎</button>
        <button class="icon-btn" title="Xuất báo cáo Excel"
                onclick="downloadSampleReport(${x.id})" style="color:#2eaa5b">💾</button>
        <button class="icon-btn danger" title="Xóa"
                onclick="deleteSampleTest(${x.id})">🗑</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="11" class="module-empty">Chưa có test hàng mẫu.</td></tr>';
}

document.addEventListener('mouseover', async (event) => {
  const btn = event.target.closest('.sample-po-link');
  if(btn){
    const wrap = btn.closest('.sample-po-wrap');
    if(!wrap) return;
    const thumb = wrap.querySelector('.sample-po-thumb');
    const img = wrap.querySelector('img[data-sample-img]');
    if(!thumb || !img) return;
    await loadSampleFirstPhotoPreview(btn.dataset.sampleId, thumb, img);
    return;
  }

  const homeLink = event.target.closest('.home-recent-link');
  if(!homeLink) return;
  const homeWrap = homeLink.closest('.home-link-wrap');
  if(!homeWrap) return;
  const homeThumb = homeWrap.querySelector('.home-link-thumb');
  const homeImg = homeWrap.querySelector('img[data-home-preview]');
  if(!homeThumb || !homeImg) return;
  const source = homeLink.dataset.source || 'burn';
  const recentId = Number(homeLink.dataset.id || 0);
  if(!recentId || homeImg.dataset.loaded === '1') return;
  try{
    const url = source === 'sample' ? `${API}/sample-tests/${recentId}` : `${API}/po-details/${recentId}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Không tải được ảnh');
    let imgSrc = '';
    if(source === 'sample'){
      const photos = Array.isArray(data.photos) ? data.photos : [];
      const last = [...photos].sort((a,b) => Number(b.slot || 0) - Number(a.slot || 0)).find(p => p && (p.file_url || p.url || p.image_url)) || null;
      imgSrc = last ? (last.file_url || last.url || last.image_url) : '';
    } else {
      imgSrc = getLastPhotoFromBurnRecord(data);
    }
    if(!imgSrc){ homeThumb.style.display = 'none'; homeImg.dataset.loaded = '1'; return; }
    homeImg.src = imgSrc;
    homeThumb.style.display = 'block';
    homeImg.dataset.loaded = '1';
  }catch(_){
    homeThumb.style.display = 'none';
    homeImg.dataset.loaded = '1';
  }
});

document.getElementById('samplePrevBtn')?.addEventListener('click', () => {
  if(sampleCurrentPage > 1){ sampleCurrentPage--; renderSamplePage(); }
});
document.getElementById('sampleNextBtn')?.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(sampleLastLoadedRows.length / SAMPLE_PAGE_SIZE));
  if(sampleCurrentPage < totalPages){ sampleCurrentPage++; renderSamplePage(); }
});
async function openSamplePhotoViewer(id){
  const modal = document.getElementById('samplePhotoViewerModal');
  const grid = document.getElementById('sampleViewerGrid');
  if(!modal || !grid) return;
  grid.innerHTML = '<div class="module-empty">Đang tải ảnh...</div>';
  modal.classList.add('show'); document.body.classList.add('modal-open');
  try{
    const r = await fetch(`${API}/sample-tests/${id}`, { cache:'no-store' });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'Không tải được test');
    document.getElementById('sampleViewerTitle').textContent = `Ảnh PO ${d.po_number||'—'}`;
    document.getElementById('sampleViewerMeta').textContent = `${d.customer_name||'—'} · ${d.product_name||'—'} · Bấc: ${d.wick_spec||'—'} · ${(d.photos||[]).length} ảnh`;
  const photos = (d.photos||[]).sort((a,b) => Number(a.slot) - Number(b.slot));
const bust = Date.now();
// ✅ Lưu danh sách URL cho lightbox dùng để navigate
window._sampleViewerPhotos = photos.map(ph => sampleEsc(ph.file_url) + '?t=' + bust);
grid.innerHTML = photos.length
  ? photos.map((ph, i) => `<div class="sample-viewer-item">
      <img src="${window._sampleViewerPhotos[i]}" loading="lazy" alt="Ảnh ${ph.slot}"
           onclick="event.stopPropagation();openLightbox('${window._sampleViewerPhotos[i]}','sample')">
      <small>Ảnh ${ph.slot}</small>
    </div>`).join('')
  : '<div class="module-empty">PO này chưa có ảnh đã chụp.</div>';
  }catch(e){ grid.innerHTML = `<div class="module-empty">Lỗi tải ảnh: ${sampleEsc(e.message)}</div>`; }
}
function closeSamplePhotoViewer(){
  const modal = document.getElementById('samplePhotoViewerModal');
  if(modal) modal.classList.remove('show');
  if(!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
  window._sampleViewerPhotos = null;
}
async function deleteSampleTest(id){ if(!confirm('Xóa hồ sơ test hàng mẫu này và toàn bộ ảnh?')) return; const r = await fetch(`${API}/sample-tests/${id}`, { method:'DELETE' }); if(!r.ok){ const d = await r.json().catch(() => ({})); return alert(d.error || 'Xóa thất bại'); } loadSampleTests(); }
function downloadSampleReport(id){ window.open(`${API}/sample-tests/${id}/report.xlsx`, '_blank'); }

// ==================== SETTINGS ====================
let settingsCache = {}, standardsCache = [];
const settingIds = ['company','factory','address','email','phone','qc_manager','burn_duration','log_interval','weight_unit','temp_unit','flame_unit','photo_max','upload_dir','photo_width','photo_quality','photo_compress','report_photos','report_title','report_footer','report_prepared','report_approved','report_chart','report_signature'];
function fmtBytes(n){ n = Number(n)||0; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(1)+' KB'; if(n<1073741824) return (n/1048576).toFixed(1)+' MB'; return (n/1073741824).toFixed(2)+' GB'; }
function switchSettingsSection(section){
  document.querySelectorAll('#settingsNav button').forEach(btn => btn.classList.toggle('active', btn.dataset.section === section));
  document.querySelectorAll('#view-settings .settings-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.settingsSection === section));
  window.scrollTo({ top:0, behavior:'smooth' });
}
async function loadSettings(){
  try{
    const d = await fetch(`${API}/settings`).then(r => r.json());
    settingsCache = d.settings || {};
    showReportLogo(settingsCache.report_logo_path ? '/uploads/system/report-logo.' + (String(settingsCache.report_logo_path).split('.').pop()) : '');
    settingIds.forEach(k => { const el = document.getElementById('set_'+k); if(el) el.value = settingsCache[k] ?? el.value ?? ''; });
    document.getElementById('dbPathLabel').textContent = d.database?.path || '—';
    document.getElementById('dbSizeLabel').textContent = fmtBytes(d.database?.size);
    document.getElementById('uploadSizeLabel').textContent = fmtBytes(d.database?.uploadSize);
    document.getElementById('backupCountLabel').textContent = d.backup?.count ?? '—';
    document.getElementById('backupKeepLabel').textContent = d.backup?.keep ?? '—';
    await loadStandards(); await loadAuditLogs(); await loadBackupList(); await checkDatabase(true);
  }catch(e){ console.error(e); }
}
function collectSettings(){ const out = {}; settingIds.forEach(k => { const el = document.getElementById('set_'+k); if(el) out[k] = el.value; }); return out; }
async function saveAppSettings(){ try{ const r = await fetch(`${API}/settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ settings: collectSettings() }) }); const d = await r.json(); if(!r.ok) throw new Error(d.error || 'Lưu thất bại'); alert('✓ Đã lưu cấu hình hệ thống.'); }catch(e){ alert('✕ ' + e.message); } }
async function uploadReportLogo(){ const input = document.getElementById('set_report_logo'); if(!input.files.length) return alert('Vui lòng chọn file logo.'); const fd = new FormData(); fd.append('logo', input.files[0]); try{ const r = await fetch(`${API}/settings/logo`, { method:'POST', body: fd }); const d = await r.json(); if(!r.ok) throw new Error(d.error || 'Tải logo thất bại'); showReportLogo(d.file_url); input.value = ''; alert('✓ Đã cập nhật logo.'); }catch(e){ alert('✕ ' + e.message); } }
function showReportLogo(url){ const img = document.getElementById('reportLogoPreview'); const st = document.getElementById('reportLogoStatus'); if(!url){ img.style.display = 'none'; img.removeAttribute('src'); st.textContent = 'Chưa có logo'; return; } img.src = url + '?t=' + Date.now(); img.style.display = 'block'; st.textContent = '✓ Đã có logo'; }
async function removeReportLogo(){ if(!confirm('Xóa logo khỏi báo cáo?')) return; try{ const r = await fetch(`${API}/settings/logo`, { method:'DELETE' }); const d = await r.json(); if(!r.ok) throw new Error(d.error || 'Xóa logo thất bại'); showReportLogo(''); alert('✓ Đã xóa logo.'); }catch(e){ alert('✕ ' + e.message); } }
async function loadStandards(){
  const r = await fetch(`${API}/settings/standards`); standardsCache = await r.json();
  const b = document.getElementById('standardsBody');
  b.innerHTML = standardsCache.length ? standardsCache.map(x => `<tr><td>${homeEscape(x.name)}</td><td>${homeEscape(x.criterion)}</td><td>${homeEscape(x.min_value||'—')}</td><td>${homeEscape(x.max_value||'—')}</td><td>${homeEscape(x.unit||'—')}</td><td class="${x.active?'badge-active':'badge-off'}">${x.active?'Đang dùng':'Tắt'}</td><td>${homeEscape(x.note||'—')}</td><td><button class="icon-btn danger" onclick="deleteStandard(${x.id})">🗑</button></td></tr>`).join('') : '<tr><td colspan="8" class="module-empty">Chưa có tiêu chuẩn.</td></tr>';
}
function addStandardRow(){ document.getElementById('standardFormBox').style.display = 'grid'; document.getElementById('std_name').focus(); }
async function saveStandard(){ const p = { name: document.getElementById('std_name').value, criterion: document.getElementById('std_criterion').value, min_value: document.getElementById('std_min').value, max_value: document.getElementById('std_max').value, unit: document.getElementById('std_unit').value }; try{ const r = await fetch(`${API}/settings/standards`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) }); const d = await r.json(); if(!r.ok) throw new Error(d.error || 'Lưu thất bại'); document.querySelectorAll('#standardFormBox input').forEach(x => x.value = ''); document.getElementById('standardFormBox').style.display = 'none'; await loadStandards(); }catch(e){ alert('✕ ' + e.message); } }
async function deleteStandard(id){ if(!confirm('Xóa tiêu chuẩn này?')) return; const r = await fetch(`${API}/settings/standards/${id}`, { method:'DELETE' }); if(!r.ok) alert('Xóa thất bại'); else loadStandards(); }
async function settingsBackup(){ try{ const r = await fetch(`${API}/settings/backup`, { method:'POST' }); const d = await r.json(); if(!r.ok) throw new Error(d.error || 'Backup thất bại'); alert('✓ Backup thành công.'); loadSettings(); }catch(e){ alert('✕ ' + e.message); } }
function backupNameSafe(v){ return String(v||'').replace(/[^A-Za-z0-9_-]/g,''); }
async function loadBackupList(){
  const b = document.getElementById('backupBody'); if(!b) return;
  b.innerHTML = '<tr><td colspan="5" class="module-empty">Đang tải...</td></tr>';
  try{
    const r = await fetch(`${API}/settings/backups`); const rows = await r.json();
    if(!r.ok) throw new Error(rows.error || 'Không tải được danh sách backup');
    b.innerHTML = rows.length ? rows.map(x => `<tr><td><b>${homeEscape(x.name)}</b></td><td>${x.hasDb?'✓ '+fmtBytes(x.dbSize):'✕ Thiếu DB'}</td><td>${x.hasUploads?'✓ '+fmtBytes(x.uploadSize):'— Không có'}</td><td id="backup-status-${backupNameSafe(x.name)}">Chưa kiểm tra</td><td><button class="btn btn-ghost" onclick="verifyBackup('${backupNameSafe(x.name)}')">🔍 Verify</button> <button class="btn" onclick="restoreBackup('${backupNameSafe(x.name)}')" ${x.hasDb?'':'disabled'}>♻️ Restore</button></td></tr>`).join('') : '<tr><td colspan="5" class="module-empty">Chưa có bản backup.</td></tr>';
  }catch(e){ b.innerHTML = `<tr><td colspan="5" class="module-empty">Lỗi: ${homeEscape(e.message)}</td></tr>`; }
}
async function verifyBackup(name){ const el = document.getElementById('backup-status-'+backupNameSafe(name)); if(el) el.textContent = '⏳ Đang kiểm tra...'; try{ const r = await fetch(`${API}/settings/backups/${encodeURIComponent(name)}/verify`); const d = await r.json(); if(!r.ok || !d.ok) throw new Error(d.error || 'Backup không đạt'); if(el) el.textContent = '🟢 Integrity OK'; return true; }catch(e){ if(el) el.textContent = '🔴 ' + e.message; alert('✕ ' + e.message); return false; } }
async function restoreBackup(name){ if(!name) return; if(!confirm(`KHÔI PHỤC BACKUP\n\n${name}\n\nHệ thống sẽ tự backup dữ liệu hiện tại trước khi restore. Server sẽ dừng sau khi restore.\n\nTiếp tục?`)) return; const ok = await verifyBackup(name); if(!ok) return; if(!confirm(`Xác nhận lần cuối: RESTORE bản ${name}?`)) return; try{ const r = await fetch(`${API}/settings/backups/${encodeURIComponent(name)}/restore`, { method:'POST' }); const d = await r.json(); if(!r.ok || !d.ok) throw new Error(d.error || 'Restore thất bại'); alert(`✓ Restore thành công: ${name}\n\nServer sẽ dừng. Chạy lại start_server.bat.`); }catch(e){ alert('✕ ' + e.message); } }
async function checkDatabase(silent=false){ const el = document.getElementById('dbHealthLabel'); try{ const d = await fetch(`${API}/settings/health`).then(r => r.json()); el.textContent = d.ok ? '🟢 Healthy' : '🔴 Corrupt'; el.className = d.ok ? 'health-ok' : 'health-bad'; if(!silent) alert(d.ok ? '✓ Database OK.' : '✕ Database có vấn đề: ' + (d.error||'kiểm tra thất bại')); }catch(e){ el.textContent = '🔴 Error'; el.className = 'health-bad'; if(!silent) alert('✕ ' + e.message); } }
async function loadAuditLogs(){ try{ const rows = await fetch(`${API}/settings/audit?limit=100`).then(r => r.json()); const b = document.getElementById('auditBody'); b.innerHTML = rows.length ? rows.map(x => `<tr><td>${homeEscape(x.created_at)}</td><td><b>${homeEscape(x.action)}</b></td><td class="audit-detail">${homeEscape(x.detail||'')}</td></tr>`).join('') : '<tr><td colspan="3" class="module-empty">Chưa có audit log.</td></tr>'; }catch(e){} }

// ==================== QUICK EDIT RESULT ====================
let quickResultPopup = null;

function openQuickResult(id, current, cell, context='test'){
  closeQuickResult();
  const popup = document.createElement('div');
  popup.className = 'quick-result-popup';
  popup.innerHTML = `
    <div class="qr-title">Đổi kết quả</div>
    <button data-v="PENDING" class="${current === 'PENDING' ? 'active' : ''}">
      <span class="qr-icon">⏳</span> PENDING
    </button>
    <button data-v="PASS" class="${current === 'PASS' ? 'active' : ''}">
      <span class="qr-icon">✓</span> PASS
    </button>
    <button data-v="FAIL" class="${current === 'FAIL' ? 'active' : ''}">
      <span class="qr-icon">✕</span> FAIL
    </button>
    <div class="qr-split"></div>
    <button class="qr-more" data-v="__edit__">
      <span class="qr-icon">✎</span> Mở chi tiết
    </button>
  `;
  document.body.appendChild(popup);

  const rect = cell.getBoundingClientRect();
  const w = popup.offsetWidth || 160;
  const h = popup.offsetHeight || 180;
  let left = rect.left;
  let top = rect.bottom + 4;
  if(left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
  if(left < 10) left = 10;
  if(top + h > window.innerHeight - 10) top = rect.top - h - 4;
  if(top < 10) top = 10;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  popup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = btn.dataset.v;
      closeQuickResult();

      if(val === '__edit__'){
        if(context === 'sample'){
          const row = sampleLastLoadedRows.find(x => Number(x.id) === Number(id));
          if(row) openSampleModal(row);
        } else {
          editRow(id);
        }
        return;
      }
      if(val === current) return;

      if(context === 'sample'){
        await quickUpdateSampleResult(id, val);
      } else {
        await quickUpdateResult(id, val);
      }
    });
  });

  quickResultPopup = popup;
}

function closeQuickResult(){
  if(quickResultPopup){ quickResultPopup.remove(); quickResultPopup = null; }
}

async function quickUpdateResult(id, newResult){
  try{
    // Fetch full record trước để không mất dữ liệu khác
    const full = await fetch(`${API}/po-details/${id}`).then(r => r.json());
    if(full.error) throw new Error(full.error);

    const payload = {
      po_id: full.PO_Id,
      product_code: full.Product_Code,
      diameter: full.Diameter ?? null,
      height: full.Height ?? null,
      frag: full.Frag ?? null,
      color: full.Color ?? null,
      wick: full.Wick ?? null,
      temperature: full.Temperature ?? null,
      start_datetime: full.Start ?? null,
      end_datetime: full.End ?? null,
      total_burn_time: full.Total_Burn_Time ?? null,
      test_date: full.Test_date || (full.Start ? full.Start.slice(0,10) : todayISO()),
      time: full.Start ? full.Start.slice(11,16) : null,
      tester: full.Tester ?? null,
      approved: full.Approved ?? null,
      test_result: newResult
    };

    const res = await fetch(`${API}/po-details/${id}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Cập nhật thất bại');

    // Refresh bảng + dashboard
    await loadTable(false);
    if(typeof loadHomeDashboard === 'function') loadHomeDashboard().catch(()=>{});
  }catch(err){
    alert('✕ ' + err.message);
  }
}

////
async function quickUpdateSampleResult(id, newResult){
  try{
    const full = await fetch(`${API}/sample-tests/${id}`).then(r => r.json());
    if(full.error) throw new Error(full.error);

    const payload = {
      customer_id: full.customer_id || null,
      purchase_order_id: full.purchase_order_id || null,
      product_name: full.product_name || full.size || '',
      wick_spec: full.wick_spec || '',
      start_datetime: full.start_datetime || null,
      end_datetime: full.end_datetime || null,
      total_burn_time: full.total_burn_time || null,
      tester: full.tester || null,
      approved: full.approved || null,
      note: full.note || null,
      test_result: newResult
    };

    const r = await fetch(`${API}/sample-tests/${id}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Cập nhật thất bại');

    await loadSampleTests();
  }catch(err){
    alert('✕ ' + err.message);
  }
}

// Event delegation cho cell click
document.addEventListener('click', function(e){
  const cell = e.target.closest('.quick-result-cell');
  if(cell){
    e.stopPropagation();
    const isSample = cell.classList.contains('sample-result-cell');
    openQuickResult(
      Number(cell.dataset.id),
      cell.dataset.result || 'PENDING',
      cell,
      isSample ? 'sample' : 'test'
    );
    return;
  }
  if(!e.target.closest('.quick-result-popup')){
    closeQuickResult();
  }
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeQuickResult();
});

// ==================== AUTO REFRESH ====================
let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 30000;

function getActiveViewName(){
  const ids = ['view-home','view-tests','view-products','view-weekly','view-master','view-photos','view-sample','view-settings'];
  for(const id of ids){
    const el = document.getElementById(id);
    if(el && !el.classList.contains('hidden')) return id.replace(/^view-/, '');
  }
  return null;
}

function stopAutoRefresh(){
  if(autoRefreshTimer){ clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

function refreshActiveView(){
  const view = getActiveViewName();
  if(!view) return;

  const modalOpen = !!document.querySelector('.modal-overlay.show, .lightbox.show, .camera-overlay.show');
  if(modalOpen) return;

  if(view === 'home') loadHomeDashboard();
  else if(view === 'tests') loadTable();
  else if(view === 'products') loadProducts(true, true);
  else if(view === 'weekly') loadWeeklyReport();
  else if(view === 'master') loadMasterData();
  else if(view === 'photos') loadPhotoGallery();
  else if(view === 'sample') loadSampleTests();
  else if(view === 'settings') loadSettings();
}

function startAutoRefresh(){
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    refreshActiveView();
  }, AUTO_REFRESH_MS);
}

// ==================== SWITCH VIEW ====================
function switchView(view){
  const isHome = view === 'home';
  const isTests = view === 'tests';
  const isProducts = view === 'products';
  const isWeekly = view === 'weekly';
  const isMaster = view === 'master';
  const isPhotos = view === 'photos';
  const isSample = view === 'sample';
  const isSettings = view === 'settings';
  document.getElementById('view-home').classList.toggle('hidden', !isHome);
  document.getElementById('view-tests').classList.toggle('hidden', !isTests);
  document.getElementById('view-products').classList.toggle('hidden', !isProducts);
  document.getElementById('view-weekly').classList.toggle('hidden', !isWeekly);
  document.getElementById('view-master').classList.toggle('hidden', !isMaster);
  document.getElementById('view-photos').classList.toggle('hidden', !isPhotos);
  const sampleView = document.getElementById('view-sample'); if(sampleView) sampleView.classList.toggle('hidden', !isSample);
  document.getElementById('view-settings').classList.toggle('hidden', !isSettings);
  document.getElementById('tabHome').classList.toggle('active', isHome);
  document.getElementById('tabTests').classList.toggle('active', isTests);
  document.getElementById('tabProducts').classList.toggle('active', isProducts);
  document.getElementById('tabWeekly').classList.toggle('active', isWeekly);
  document.getElementById('tabMaster').classList.toggle('active', isMaster);
  document.getElementById('tabPhotos').classList.toggle('active', isPhotos);
  const tabSample = document.getElementById('tabSample'); if(tabSample) tabSample.classList.toggle('active', isSample);
  document.getElementById('tabSettings').classList.toggle('active', isSettings);
  if(isHome) loadHomeDashboard();
  if(isTests){ loadClientsAndPos().then(() => loadTable(true)).catch(console.error); }
 if(isProducts){ loadClientsAndPos().then(() => loadProducts(true, true)).catch(console.error); }
  if(isWeekly) loadWeeklyReport();
  if(isMaster){ loadMasterData(); loadClientsAndPos().catch(console.error); }
  if(isPhotos) loadPhotoGallery();
  if(isSample){ loadSampleRefs(); loadSampleTests(); }
  if(isSettings) loadSettings();
  startAutoRefresh();
}

// ==================== PRODUCTS ====================
function populateProductPoSelects(){
  const opts = (posCache || []).map(p => `<option value="${p.PO_Id}">${p.PO_Name} — ${p.Cus_Name || ''}</option>`).join('') || '<option value="">Chưa có PO nào</option>';
  const importPo = document.getElementById('prod_import_po'); if(importPo) importPo.innerHTML = opts;
  document.getElementById('prod_add_po').innerHTML = opts;
  document.getElementById('prod_filter_po').innerHTML = '<option value="">Tất cả PO</option>' + (posCache || []).map(p => `<option value="${p.PO_Id}">${p.PO_Name}</option>`).join('');
}
function escapeHtmlProd(str){ return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Chuẩn hoá text để tìm không phân biệt dấu / hoa thường
function normalizeSearch(s){
  return String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g, 'd');
}
const PROD_PAGE_SIZE = 10;
let prodCurrentPage = 1;
let prodLastLoadedRows = [];
let prodCacheAll = [];
let prodCachePO = null;

function invalidateProductCache(){ prodCacheAll = []; prodCachePO = null; }

async function loadProducts(resetPage = true, forceRefresh = false){
  const tbody = document.getElementById('prod_table_body');
  const po_id = document.getElementById('prod_filter_po').value;
  const keyword = document.getElementById('prod_filter_code').value.trim();

  const needFetch = forceRefresh || prodCachePO !== po_id || !prodCacheAll.length;

  // Chỉ hiện loading khi thực sự phải fetch từ server
  if(needFetch) tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Đang tải dữ liệu…</td></tr>';

  try{
    if(needFetch){
      const params = new URLSearchParams();
      if(po_id) params.set('order_id', po_id);
      prodCacheAll = await fetch(`${API}/products?${params}`).then(r => r.json());
      prodCachePO = po_id;
    }

    // ---- Lọc CLIENT-SIDE trên TẤT CẢ các trường ----
    let rows = prodCacheAll;
    if(keyword){
      const k = normalizeSearch(keyword);
      rows = rows.filter(r =>
        [
          r.Product_Code,
          r.po_number,
          r.Size,
          r.Weight,
          r.Wick,
          r.Color,
          r.Fragrance,
          r.Diameter,
          r.Height,
          r.Notes,
          r.customer_name   // nếu backend trả kèm
        ].some(v => normalizeSearch(v).includes(k))
      );
    }

    prodLastLoadedRows = rows;
    if(resetPage) prodCurrentPage = 1;
    renderProductsPage();
    updateProductSearchHint(keyword, rows.length, prodCacheAll.length);
  } catch(_e){
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Không tải được dữ liệu.</td></tr>';
  }
}

function updateProductSearchHint(keyword, found, total){
  const el = document.getElementById('prod_search_hint');
  if(!el) return;
  if(!keyword){ el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'inline-block';
  el.innerHTML = `<b>${found}</b>/${total} khớp &nbsp;<a href="#" onclick="event.preventDefault();clearProductSearch()" style="color:#187DCC;text-decoration:underline">Xoá</a>`;
}

function clearProductSearch(){
  document.getElementById('prod_filter_code').value = '';
  loadProducts(true);
}

function renderProductsPage(){
  const rows = prodLastLoadedRows;
  const tbody = document.getElementById('prod_table_body');
  document.getElementById('prod_count_label').textContent = `${rows.length}`;
  document.getElementById('prod_count_footer').textContent = `${rows.length} sản phẩm`;
  document.getElementById('prod_po_count_label').textContent = new Set(rows.map(r => r.Order_Id || r.PO_Id || r.po_id || r.po_number).filter(Boolean)).size;
  const totalPages = Math.max(1, Math.ceil(rows.length / PROD_PAGE_SIZE));
  if(prodCurrentPage > totalPages) prodCurrentPage = totalPages;
  if(prodCurrentPage < 1) prodCurrentPage = 1;
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Chưa có sản phẩm nào.</td></tr>';
  } else {
    const start = (prodCurrentPage - 1) * PROD_PAGE_SIZE;
    const pageRows = rows.slice(start, start + PROD_PAGE_SIZE);
    tbody.innerHTML = pageRows.map(r => `<tr>
      <td class="mono">${escapeHtmlProd(r.Product_Code)}</td><td>${escapeHtmlProd(r.po_number)}</td><td>${escapeHtmlProd(r.Size) || '—'}</td><td class="mono">${r.Weight ?? '—'}</td><td>${escapeHtmlProd(r.Wick) || '—'}</td><td>${escapeHtmlProd(r.Color) || '—'}</td><td>${escapeHtmlProd(r.Fragrance) || '—'}</td><td class="mono">${r.Diameter ?? '—'}</td><td class="mono">${r.Height ?? '—'}</td><td>${escapeHtmlProd(r.Notes) || '—'}</td><td><div class="row-actions" style="justify-content:center"><button type="button" class="icon-btn" title="Sửa" onclick="openProductEditModal(${r.Id})">✎</button><button type="button" class="icon-btn danger" title="Xóa" onclick="deleteProduct(${r.Id})">🗑</button></div></td></tr>`).join('');
  }
  document.getElementById('prod_page_label').textContent = `${prodCurrentPage} / ${totalPages}`;
  document.getElementById('prod_page_label_top').textContent = `${prodCurrentPage} / ${totalPages}`;
  document.getElementById('prod_prev_btn').disabled = prodCurrentPage <= 1;
  document.getElementById('prod_next_btn').disabled = prodCurrentPage >= totalPages;
}

document.getElementById('prod_prev_btn').addEventListener('click', () => { if(prodCurrentPage > 1){ prodCurrentPage--; renderProductsPage(); } });
document.getElementById('prod_next_btn').addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil(prodLastLoadedRows.length / PROD_PAGE_SIZE)); if(prodCurrentPage < totalPages){ prodCurrentPage++; renderProductsPage(); } });

async function deleteProduct(id){
  if(!confirm('Xóa sản phẩm này?')) return;
  try{ const res = await fetch(`${API}/products/${id}`, { method:'DELETE' }); if(!res.ok && res.status !== 204) throw new Error('Xóa thất bại');
  invalidateProductCache
 await loadProducts(false, true);
 }catch(err){ alert(err.message); }
}
document.getElementById('prod_import_btn').addEventListener('click', async () => {
  const msg = document.getElementById('prod_import_msg');
  msg.className = 'import-result-box'; msg.textContent = '';
  const fileInput = document.getElementById('prod_import_file');
  const file = fileInput.files[0];
  if(!file){ msg.textContent = 'Vui lòng chọn file Excel.'; msg.className = 'import-result-box err'; return; }
  const btn = document.getElementById('prod_import_btn'); const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang import...';
  try{
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(`${API}/products/import`, { method:'POST', body: fd });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Import thất bại');
    msg.innerHTML = `✓ Import thành công <b>${data.imported}</b> mã hàng • Tạo mới ${data.created_customers} khách hàng • Tạo mới ${data.created_pos} PO` + (data.existing ? ` • Bỏ qua ${data.existing} mã hàng đã có` : '') + (data.skipped_rows?.length ? ` • ${data.skipped_rows.length} dòng bỏ qua` : '');
    msg.className = 'import-result-box ok';
    fileInput.value = ''; document.getElementById('prod_import_file_name').textContent = 'Đã import xong';
    await loadClientsAndPos(); await loadMasterData(); 
   invalidateProductCache();
  await loadProducts(false, true);
    setTimeout(() => closeProductImportModal(), 500);
  } catch(err){ msg.textContent = err.message; msg.className = 'import-result-box err'; }
  finally{ btn.disabled = false; btn.textContent = original; }
});
function parseSizeToDimensionsPreview(size){
  if(!size) return { diameter_mm: null, height_mm: null };
  const str = String(size).trim();
  const isCm = /cm\s*$/i.test(str) && !/mm\s*$/i.test(str);
  const factor = isCm ? 10 : 1;
  const dPrefixMatch = str.match(/^\s*[DØ]\s*(\d+(?:[.,]\d+)?)/i);
  const leadMatch = str.match(/^\s*(\d+(?:[.,]\d+)?)/);
  const diameterRaw = dPrefixMatch ? dPrefixMatch[1] : (leadMatch ? leadMatch[1] : null);
  const hPrefixMatch = str.match(/H\s*(\d+(?:[.,]\d+)?)/i);
  const xMatch = str.match(/[xX×]\s*(\d+(?:[.,]\d+)?)/);
  const heightRaw = hPrefixMatch ? hPrefixMatch[1] : (xMatch ? xMatch[1] : null);
  return { diameter_mm: diameterRaw !== null ? Number(diameterRaw.replace(',','.')) * factor : null, height_mm: heightRaw !== null ? Number(heightRaw.replace(',','.')) * factor : null };
}
document.getElementById('prod_add_size').addEventListener('input', (e) => {
  const dims = parseSizeToDimensionsPreview(e.target.value);
  document.getElementById('prod_add_diameter').value = dims.diameter_mm ?? '';
  document.getElementById('prod_add_height').value = dims.height_mm ?? '';
});
document.getElementById('prod_add_btn').addEventListener('click', async () => {
  const msg = document.getElementById('prod_add_msg');
  msg.className = 'msg'; msg.textContent = '';
  const editId = document.getElementById('prod_edit_id').value;
  const isEdit = !!editId;
  const payload = { order_id: document.getElementById('prod_add_po').value, product_code: document.getElementById('prod_add_code').value.trim(), size: document.getElementById('prod_add_size').value.trim(), weight: document.getElementById('prod_add_weight').value, wick: document.getElementById('prod_add_wick').value.trim(), color: document.getElementById('prod_add_color').value.trim(), fragrance: document.getElementById('prod_add_frag').value.trim(), notes: document.getElementById('prod_add_notes').value.trim() };
  if(!payload.order_id || !payload.product_code){ msg.textContent = 'Vui lòng chọn PO và nhập mã sản phẩm.'; msg.className = 'msg err show'; return; }
  const btn = document.getElementById('prod_add_btn'); const original = btn.textContent;
  btn.disabled = true; btn.textContent = isEdit ? 'Đang cập nhật...' : 'Đang thêm...';
  try{
    const url = isEdit ? `${API}/products/${editId}` : `${API}/products`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || (isEdit ? 'Cập nhật thất bại' : 'Thêm thất bại'));
    msg.textContent = isEdit ? '✓ Đã cập nhật sản phẩm.' : '✓ Đã thêm sản phẩm.';
    msg.className = 'msg ok show';
    ['prod_add_code','prod_add_size','prod_add_weight','prod_add_wick','prod_add_color','prod_add_frag','prod_add_diameter','prod_add_height','prod_add_notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('prod_edit_id').value = '';
    await loadProducts(false);
    setTimeout(() => closeProductAddModal(), 350);
  } catch(err){ msg.textContent = err.message; msg.className = 'msg err show'; }
  finally{ btn.disabled = false; btn.textContent = original; }
});
document.getElementById('prod_refresh_btn').addEventListener('click', () => {
  invalidateProductCache();
  loadProducts(true, true);
});
document.getElementById('prod_report_btn').addEventListener('click', async () => {
  const poId = document.getElementById('prod_filter_po').value;
  if(!poId){ alert('Vui lòng chọn Đơn hàng / PO trước khi xuất báo cáo.'); return; }
  const btn = document.getElementById('prod_report_btn'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xuất...';
  try{
    const res = await fetch(`${API}/products/report/${encodeURIComponent(poId)}.xlsx`);
    if(!res.ok){ const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Xuất báo cáo thất bại'); }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = m ? decodeURIComponent(m[1]) : 'BaoCaoSanPham.xlsx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch(err){ alert(err.message); }
  finally{ btn.disabled = false; btn.textContent = old; }
});
async function downloadProductLabels(format){
  const poId = document.getElementById('prod_filter_po').value;
  if(!poId){ alert('Vui lòng chọn Đơn hàng / PO trước khi in tem.'); return; }
  const btn = format === 'pdf' ? document.getElementById('prod_labels_btn') : document.getElementById('prod_labels_xlsx_btn');
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang tạo tem...';
  try{
    const res = await fetch(`${API}/products/labels/${encodeURIComponent(poId)}.${format}`);
    if(!res.ok){ const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Tạo tem thất bại'); }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = m ? decodeURIComponent(m[1]) : `InTem_A5.${format}`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch(err){ alert(err.message); }
  finally{ btn.disabled = false; btn.textContent = old; }
}
document.getElementById('prod_labels_btn').addEventListener('click', () => downloadProductLabels('pdf'));
document.getElementById('prod_labels_xlsx_btn').addEventListener('click', () => downloadProductLabels('xlsx'));
document.getElementById('prod_filter_po').addEventListener('change', () => loadProducts());
document.getElementById('prod_filter_code').addEventListener('input', () => { clearTimeout(window._pft); window._pft = setTimeout(() => loadProducts(), 350); });

let prodEditMode = false;
function openProductAddModal(){
  prodEditMode = false;
  document.getElementById('prod_edit_id').value = '';
  document.getElementById('productAddTitle').textContent = '＋ Thêm sản phẩm';
  const sub = document.getElementById('productAddSubtitle'); if(sub) sub.textContent = 'Nhập thông tin sản phẩm mới vào Product Master';
  document.getElementById('prod_add_btn').textContent = '✓ Thêm sản phẩm';
  document.getElementById('productAddModal').classList.add('show');
  document.body.classList.add('modal-open');
  populateProductPoSelects();
  setTimeout(() => document.getElementById('prod_add_code').focus(), 60);
}
function openProductEditModal(id){
  const p = (prodLastLoadedRows || []).find(x => Number(x.Id) === Number(id));
  if(!p){ alert('Không tìm thấy sản phẩm #' + id); return; }
  prodEditMode = true;
  document.getElementById('prod_edit_id').value = p.Id;
  document.getElementById('productAddTitle').textContent = '✎ Sửa sản phẩm #' + p.Id;
  const sub = document.getElementById('productAddSubtitle'); if(sub) sub.textContent = 'Cập nhật thông tin sản phẩm trong Product Master';
  document.getElementById('prod_add_btn').textContent = '✓ Cập nhật';
  document.getElementById('productAddModal').classList.add('show');
  document.body.classList.add('modal-open');
  populateProductPoSelects();
  const poId = p.Order_Id || p.order_id || p.PO_Id || p.po_id || '';
  const poSelect = document.getElementById('prod_add_po');
  if(poId && !Array.from(poSelect.options).some(o => String(o.value) === String(poId))){
    const opt = document.createElement('option'); opt.value = poId; opt.textContent = p.po_number || ('PO #' + poId); poSelect.appendChild(opt);
  }
  poSelect.value = poId;
  document.getElementById('prod_add_code').value = p.Product_Code || '';
  document.getElementById('prod_add_size').value = p.Size || '';
  document.getElementById('prod_add_weight').value = p.Weight ?? '';
  document.getElementById('prod_add_wick').value = p.Wick || '';
  document.getElementById('prod_add_color').value = p.Color || '';
  document.getElementById('prod_add_frag').value = p.Fragrance || '';
  document.getElementById('prod_add_diameter').value = p.Diameter ?? '';
  document.getElementById('prod_add_height').value = p.Height ?? '';
  document.getElementById('prod_add_notes').value = p.Notes || '';
  const msg = document.getElementById('prod_add_msg'); msg.className = 'msg'; msg.textContent = '';
  setTimeout(() => document.getElementById('prod_add_code').focus(), 60);
}
function closeProductAddModal(){
  document.getElementById('productAddModal').classList.remove('show');
  if(!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
  const msg = document.getElementById('prod_add_msg'); msg.className = 'msg'; msg.textContent = '';
  prodEditMode = false;
  document.getElementById('prod_edit_id').value = '';
}
function resetProductAddForm(){
  ['prod_add_code','prod_add_size','prod_add_weight','prod_add_wick','prod_add_color','prod_add_frag','prod_add_diameter','prod_add_height','prod_add_notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const msg = document.getElementById('prod_add_msg'); msg.className = 'msg'; msg.textContent = '';
  document.getElementById('prod_edit_id').value = '';
  prodEditMode = false;
}
function openProductImportModal(){
  document.getElementById('productImportModal').classList.add('show');
  document.body.classList.add('modal-open');
  document.getElementById('prod_import_file_name').textContent = 'Chưa chọn file';
  setTimeout(() => document.getElementById('prod_choose_file_btn').focus(), 60);
}
function closeProductImportModal(){
  document.getElementById('productImportModal').classList.remove('show');
  if(!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
}
document.getElementById('prod_open_add_btn').addEventListener('click', () => { resetProductAddForm(); openProductAddModal(); });
document.getElementById('prod_open_import_btn').addEventListener('click', openProductImportModal);
document.getElementById('productAddClose').addEventListener('click', closeProductAddModal);
document.getElementById('productAddCancel').addEventListener('click', closeProductAddModal);
document.getElementById('productImportClose').addEventListener('click', closeProductImportModal);
document.getElementById('productImportCancel').addEventListener('click', closeProductImportModal);
document.getElementById('prod_choose_file_btn').addEventListener('click', () => document.getElementById('prod_import_file').click());
document.getElementById('prod_import_file').addEventListener('change', e => {
  const f = e.target.files[0];
  document.getElementById('prod_import_file_name').textContent = f ? `📄 ${f.name} • ${(f.size/1024/1024).toFixed(2)} MB` : 'Chưa chọn file';
});
['productAddModal','productImportModal'].forEach(id => document.getElementById(id).addEventListener('click', e => {
  if(e.target.id === id){ id === 'productAddModal' ? closeProductAddModal() : closeProductImportModal(); }
}));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    if(document.getElementById('productAddModal').classList.contains('show')) closeProductAddModal();
    if(document.getElementById('productImportModal').classList.contains('show')) closeProductImportModal();
  }
});

// ==================== OUTSIDE-CLICK ====================
document.getElementById('samplePhotoViewerModal')?.addEventListener('click', function(e){ if(e.target === this) closeSamplePhotoViewer(); });
document.addEventListener('click', function(e){
  const m = document.getElementById('sampleModal');
  if(!m || !m.classList.contains('show')) return;
  if(e.target === m && typeof closeSampleModal === 'function') closeSampleModal();
});
document.getElementById('lightboxImg')?.addEventListener('click', function(e){ e.stopPropagation(); });

switchView('home');
