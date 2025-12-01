/* final script.js - CORS-safe frontend for PCAM Troubleshooter
   IMPORTANT: set API_URL to your deployed Apps Script exec URL (the /exec URL)
*/
const API_URL = "https://script.google.com/macros/s/AKfycbym-zipRVQPUrtbrh0B-Lu_mz3FCIvoHGXfeyxWFUbtVG2xQgFmjwxOcsRHow1S1S0/exec"; // <- REPLACE if different
const CORRECT_PASSWORD = "SIKIPAL@dip";

const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";
const PENDING_KEY = "pcam_pending_v1";

let errorDatabase = {};        // {code: {..}}
let occurrencesCache = [];     // array of occurrence objects

/* -------------------- helpers -------------------- */
const qs = id => document.getElementById(id);
const padKey = k => String(k||'').replace(/^E/i,'').padStart(3,'0');
const saveLocalDB = ()=> localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase));
const saveLocalOcc = ()=> localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache));
const loadLocalDB = ()=> { try { return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}'); } catch(e){ return {}; } };
const loadLocalOcc = ()=> { try { return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); } catch(e){ return []; } };
const loadPending = ()=> { try { return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); } catch(e){ return []; } };
const savePending = arr => localStorage.setItem(PENDING_KEY, JSON.stringify(arr||[]));

function updateNetworkUI(){
  const el = qs('netStatus'), dot = qs('statusDot');
  if(!el) return;
  if (navigator.onLine) {
    el.textContent = 'Online';
    if(dot) dot.style.background = '#16a34a';
  } else {
    el.textContent = 'Offline';
    if(dot) dot.style.background = '#ef4444';
  }
}

/* CORS-safe API call: encode payload in URL (GET) */
async function apiCall(action, body){
  // body: JS object (payload) or undefined
  try {
    let url = API_URL + "?action=" + encodeURIComponent(action);
    if (body) {
      const payload = JSON.stringify(body);
      url += "&payload=" + encodeURIComponent(payload);
    }
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch(e){ return txt; }
  } catch (err) {
    throw err;
  }
}

/* -------------------- fetch/load data -------------------- */
async function fetchErrorsFromApi(){
  try {
    const json = await apiCall('getErrors');
    const list = Array.isArray(json) ? json : (json.errors || []);
    errorDatabase = {};
    list.forEach(r=>{
      const key = padKey(r.error_number || r.error_number || r["error_number"]);
      if(!key) return;
      errorDatabase[key] = {
        error_number: key,
        message: r.message || '',
        cancel: r.cancel || '',
        detection: r.detection || '',
        'continue': r['continue'] || '',
        solution: r.solution || ''
      };
    });
    saveLocalDB();
    return true;
  } catch(err){
    console.warn('fetchErrorsFromApi failed', err);
    return false;
  }
}

async function fetchOccurrencesFromApi(){
  try {
    const json = await apiCall('getOccurrences');
    const list = Array.isArray(json) ? json : (json.occurrences || []);
    occurrencesCache = list.map(r => ({
      occurrenceId: r.occurrenceId || r.occurrenceId || r["occurrenceId"] || r["occurrenceId"] || (r[0]||''),
      error_number: padKey(r.error_number || r.error_number || r.Error_Number || r.errorNumber),
      date: r.date || '',
      customerName: r.customerName || '',
      machineModel: r.machineModel || '',
      machineSerial: r.machineSerial || '',
      remedy: r.remedy || '',
      technician: r.technician || '',
      downtime: r.downtime || '',
      parts: r.parts || '',
      imageUrl: r.imageUrl || ''
    }));
    saveLocalOcc();
    return true;
  } catch(err){
    console.warn('fetchOccurrencesFromApi failed', err);
    return false;
  }
}

/* -------------------- UI population -------------------- */
function populateOccurrenceDropdown(){
  const dd = qs('occurrenceErrorCode');
  if(!dd) return;
  dd.innerHTML = '<option value="">Select Error Code</option>';
  Object.keys(errorDatabase).sort((a,b)=>Number(a)-Number(b)).forEach(code=>{
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = code;
    dd.appendChild(opt);
  });
}

/* escape html */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

/* -------------------- Search & render -------------------- */
function searchError(){
  const raw = qs('errorCode').value.trim();
  const resultDiv = qs('result');
  if(!raw){ resultDiv.innerHTML = `<div class="not-found"><h3>Please enter an error code</h3></div>`; return; }
  const key = padKey(raw);
  const e = errorDatabase[key];
  if(!e){ resultDiv.innerHTML = `<div class="not-found"><h3>Error Code "${raw}" Not Found</h3></div>`; return; }

  let html = `<div class="error-info"><div class="error-header"><h2 style="color:#1e3c72">Error Code Details</h2><div class="error-code">${key}</div></div>`;
  html += `<div class="info-section"><h3>Message</h3><p>${escapeHtml(e.message)}</p></div>`;
  html += `<div class="info-section"><h3>Cancel</h3><p>${escapeHtml(e.cancel)}</p></div>`;
  html += `<div class="info-section"><h3>Detection</h3><p>${escapeHtml(e.detection)}</p></div>`;
  html += `<div class="info-section"><h3>Continue</h3><p>${escapeHtml(e['continue']||'')}</p></div>`;
  html += `<div class="info-section"><h3>Solution</h3><p>${escapeHtml(e.solution)}</p></div>`;

  const occs = (occurrencesCache || []).filter(o => padKey(o.error_number) === key);
  html += `<div style="margin-top:12px"><h3>Occurrences (${occs.length})</h3></div>`;
  html += renderAccordionList(key, occs);
  html += `</div>`;
  resultDiv.innerHTML = html;
  attachAccordionHandlers();
}

/* render accordion HTML for occurrences */
function renderAccordionList(filterKey, list){
  if(!list || !list.length) return `<div style="padding:12px;color:#666">No previous occurrences recorded.</div>`;
  let html = '<div class="accordion">';
  list.slice().reverse().forEach((occ, idx)=>{
    const id = occ.occurrenceId || ('occ_local_'+idx+'_'+(Date.now()%10000));
    const title = `${escapeHtml(occ.date||'')} — ${escapeHtml(occ.technician||'')}`;
    html += `<div class="accordion-item" data-occid="${id}">
      <button class="accordion-header" data-occid="${id}" aria-expanded="false">${escapeHtml(title)} <span style="float:right">▼</span></button>
      <div class="accordion-body" data-occid="${id}" style="display:none">
        <p><strong>Customer:</strong> ${escapeHtml(occ.customerName||'')}</p>
        <p><strong>Model:</strong> ${escapeHtml(occ.machineModel||'')}</p>
        <p><strong>Serial:</strong> ${escapeHtml(occ.machineSerial||'')}</p>
        <p><strong>Remedy:</strong> ${escapeHtml(occ.remedy||'')}</p>
        <p><strong>Downtime:</strong> ${escapeHtml(occ.downtime||'')}</p>
        <p><strong>Parts:</strong> ${escapeHtml(occ.parts||'')}</p>`;
    if(occ.imageUrl) html += `<p><strong>Image:</strong><br><img src="${occ.imageUrl}" style="max-width:320px;border-radius:6px;border:1px solid #ddd" /></p>`;
    html += `<div style="margin-top:8px"><button class="btn-delete-occ" data-occid="${id}">🗑 Delete</button></div>`;
    html += `</div></div>`;
  });
  html += '</div>';
  return html;
}

function renderRecentOccurrencesPanel(){
  const container = qs('occList');
  if(!container) return;
  const list = occurrencesCache || [];
  if(!list.length) {
    container.innerHTML = '<div style="padding:12px;color:#666">No occurrences loaded</div>';
    attachAccordionHandlers();
    return;
  }
  container.innerHTML = renderAccordionList('', list);
  attachAccordionHandlers();
}

/* attach accordion click handlers & delete handlers */
function attachAccordionHandlers(){
  document.querySelectorAll('.accordion-header').forEach(btn=>{
    btn.onclick = (e)=>{
      const id = btn.getAttribute('data-occid');
      const body = document.querySelector('.accordion-body[data-occid="'+id+'"]');
      if(!body) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      body.style.display = expanded ? 'none' : 'block';
    };
  });
  document.querySelectorAll('.btn-delete-occ').forEach(b=>{
    b.onclick = async (e)=>{
      const occid = b.getAttribute('data-occid');
      if(!confirm('Delete this occurrence?')) return;
      try {
        // call backend via GET-payload
        if(navigator.onLine){
          const res = await apiCall('deleteOccurrence', { occurrenceId: occid });
          if(res && res.status === 'ok'){
            occurrencesCache = (occurrencesCache||[]).filter(o=> (o.occurrenceId||'') !== occid );
            saveLocalOcc();
            searchError(); renderRecentOccurrencesPanel();
            alert('Deleted.');
            return;
          }
          // not ok -> fallback remove locally
        }
      } catch(err){
        console.warn('deleteOccurrence failed', err);
      }
      // fallback local delete
      occurrencesCache = (occurrencesCache||[]).filter(o=> (o.occurrenceId||'') !== occid );
      saveLocalOcc();
      searchError(); renderRecentOccurrencesPanel();
      alert('Deleted locally (offline).');
    };
  });
}

/* -------------------- Add new error -------------------- */
async function saveNewError(){
  const codeRaw = qs('newErrorCode').value.trim();
  if(!codeRaw){ alert('Enter error code'); return; }
  const key = padKey(codeRaw);
  const obj = {
    error_number: key,
    message: qs('newMessage').value.trim(),
    cancel: qs('newCancel').value.trim(),
    detection: qs('newDetection').value.trim(),
    'continue': qs('newContinue').value.trim(),
    solution: qs('newSolution').value.trim()
  };

  try {
    if(navigator.onLine){
      const res = await apiCall('addError', obj);
      if(res && res.status === 'ok'){
        errorDatabase[key] = obj;
        saveLocalDB();
        populateOccurrenceDropdown();
        toggleForm('errorForm', false);
        alert('Saved online.');
        return;
      }
    }
  } catch(e){
    console.warn('saveNewError failed', e);
  }
  errorDatabase[key] = obj;
  saveLocalDB();
  populateOccurrenceDropdown();
  toggleForm('errorForm', false);
  alert('Saved locally (offline).');
}

/* -------------------- image resize helper -------------------- */
function fileToResizedBase64(file, maxWidth=800, quality=0.7){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = function(){
      const img = new Image();
      img.onload = function(){
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const mime = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, quality);
        resolve({ base64: dataUrl.split(',')[1], mime: mime });
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/* -------------------- Add new occurrence -------------------- */
async function saveNewOccurrence(){
  const code = qs('occurrenceErrorCode').value;
  if(!code){ alert('Select error code'); return; }
  const occ = {
    occurrenceId: "occ_" + Date.now() + "_" + Math.floor(Math.random()*9000+1000),
    error_number: padKey(code),
    date: qs('occurrenceDate').value || new Date().toISOString().slice(0,10),
    customerName: qs('customerName').value.trim(),
    machineModel: qs('machineModel').value.trim(),
    machineSerial: qs('machineSerial').value.trim(),
    remedy: qs('occurrenceRemedy').value.trim(),
    technician: qs('occurrenceTechnician').value.trim(),
    downtime: qs('occurrenceDowntime').value.trim(),
    parts: qs('occurrenceParts').value.trim()
  };

  const f = qs('occurrenceImage').files[0];
  if(f){
    try {
      const { base64, mime } = await fileToResizedBase64(f, 1000, 0.7);
      occ.imageBase64 = base64;
      occ.imageMime = mime;
    } catch(err){
      console.warn('Image conversion failed', err);
    }
  }

  // try send to server using GET-payload
  if(navigator.onLine){
    try {
      const res = await apiCall('addOccurrence', occ);
      if(res && res.status === 'ok'){
        occ.imageUrl = res.imageUrl || '';
        occurrencesCache.push(occ);
        saveLocalOcc();
        toggleForm('occurrenceForm', false);
        alert('Occurrence saved online.');
        const cur = padKey(qs('errorCode').value || '');
        if(cur === padKey(occ.error_number)) searchError();
        renderRecentOccurrencesPanel();
        return;
      }
    } catch(err){
      console.warn('addOccurrence online failed', err);
    }
  }

  // offline fallback: queue and local save
  const pending = loadPending();
  pending.push(occ);
  savePending(pending);
  occurrencesCache.push(occ);
  saveLocalOcc();
  toggleForm('occurrenceForm', false);
  alert('Queued locally (offline).');
  renderRecentOccurrencesPanel();
}

/* -------------------- sync pending occurrences -------------------- */
async function syncPending(){
  const pending = loadPending();
  if(!pending.length) return;
  if(!navigator.onLine) return;
  const remaining = [];
  for(const p of pending){
    try {
      const res = await apiCall('addOccurrence', p);
      if(res && res.status === 'ok'){
        // update local occurrences imageUrl if present
        occurrencesCache = (occurrencesCache||[]).map(o=>{
          if((o.occurrenceId||'') === (p.occurrenceId||'')) {
            o.imageUrl = res.imageUrl || o.imageUrl || '';
          }
          return o;
        });
      } else {
        remaining.push(p);
      }
    } catch(err){
      remaining.push(p);
    }
  }
  savePending(remaining);
  saveLocalOcc();
  await loadRemoteData(); // refresh remote
}

/* -------------------- toggle form utility -------------------- */
function toggleForm(id, show){
  const el = qs(id);
  if(!el) return;
  if(typeof show === 'boolean') el.style.display = show ? 'block' : 'none';
  else el.style.display = el.style.display === 'block' ? 'none' : 'block';
  if(id === 'occurrenceForm') populateOccurrenceDropdown();
}

/* -------------------- export/import -------------------- */
function exportDB(){
  const payload = { errors: errorDatabase, occurrences: occurrencesCache };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'pcam_db_export_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
}
function importDB(e){
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = ()=> {
    try {
      const obj = JSON.parse(fr.result);
      if(obj.errors) { errorDatabase = obj.errors; saveLocalDB(); }
      if(obj.occurrences) { occurrencesCache = obj.occurrences; saveLocalOcc(); }
      populateOccurrenceDropdown();
      renderRecentOccurrencesPanel();
      alert('Import complete (local).');
    } catch(err) { alert('Import failed: '+err); }
  };
  fr.readAsText(f);
}

/* -------------------- initialization & UI events -------------------- */
async function loadRemoteData(){
  updateNetworkUI();
  let ok = false;
  if(navigator.onLine){
    ok = await fetchErrorsFromApi();
    if(ok) await fetchOccurrencesFromApi();
  }
  if(!ok){
    errorDatabase = loadLocalDB();
    occurrencesCache = loadLocalOcc();
  } else {
    saveLocalDB(); saveLocalOcc();
  }
  populateOccurrenceDropdown();
  renderRecentOccurrencesPanel();
  attachUIEvents();
  if(navigator.onLine) syncPending();
}

function attachUIEvents(){
  // buttons
  const btnSearch = qs('btnSearch');
  if(btnSearch) btnSearch.onclick = searchError;
  const btnSaveError = qs('btnSaveError'); if(btnSaveError) btnSaveError.onclick = saveNewError;
  const btnSaveOcc = qs('btnSaveOcc'); if(btnSaveOcc) btnSaveOcc.onclick = saveNewOccurrence;
  const btnExport = qs('btnExport'); if(btnExport) btnExport.onclick = exportDB;
  const importFile = qs('importFile'); if(importFile) importFile.onchange = importDB;
  // toggles
  document.querySelectorAll('.toggle-form').forEach(b=>{
    b.onclick = ()=> toggleForm(b.getAttribute('data-target'));
  });
  document.querySelectorAll('.btn-cancel').forEach(b=>{
    b.onclick = ()=> { toggleForm(b.getAttribute('data-target'), false); };
  });
  // enter key handlers
  const pass = qs('passwordInput'); if(pass) pass.onkeydown = e=>{ if(e.key==='Enter') checkPassword(); };
  const search = qs('errorCode'); if(search) search.onkeydown = e=>{ if(e.key==='Enter') searchError(); };
  const lastErrorField = qs('newSolution'); if(lastErrorField) lastErrorField.onkeydown = e=>{ if(e.key==='Enter') saveNewError(); };
  const lastOccField = qs('occurrenceParts'); if(lastOccField) lastOccField.onkeydown = e=>{ if(e.key==='Enter') saveNewOccurrence(); };

  // export/import label open file
  const importLabel = document.querySelector('label[for="importFile"]');
  if(importLabel) { importLabel.onclick = ()=> qs('importFile').click(); }
}

/* -------------------- password handling -------------------- */
function checkPassword(){
  const p = qs('passwordInput').value;
  if(p === CORRECT_PASSWORD){
    qs('passwordOverlay').style.display = 'none';
    qs('mainContainer').style.display = 'block';
    loadRemoteData();
  } else { alert('Incorrect password'); }
}

/* init */
document.addEventListener('DOMContentLoaded', ()=>{
  updateNetworkUI();
  window.addEventListener('online', ()=>{ updateNetworkUI(); syncPending(); });
  window.addEventListener('offline', ()=>{ updateNetworkUI(); });
  const accessBtn = qs('btnAccess'); if(accessBtn) accessBtn.onclick = checkPassword;
});

/* expose for debugging */
window.__pcam = {
  apiCall, loadRemoteData, saveLocalDB, saveLocalOcc, loadLocalDB, loadLocalOcc, loadPending
};
