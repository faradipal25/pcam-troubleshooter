/* Final script.js - GitHub frontend for PCAM Troubleshooter
   IMPORTANT: set API_URL to your Apps Script exec URL (the web app exec URL)
*/
const API_URL = "https://script.google.com/macros/s/AKfycbym-zipRVQPUrtbrh0B-Lu_mz3FCIvoHGXfeyxWFUbtVG2xQgFmjwxOcsRHow1S1S0/exec";
const CORRECT_PASSWORD = "SIKIPAL@dip";

const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";
const PENDING_KEY = "pcam_pending_v1";

let errorDatabase = {};
let occurrencesCache = [];

/* short helpers */
const qs = id => document.getElementById(id);
const padKey = k => String(k||'').replace(/^E/i,'').padStart(3,'0');
const saveLocalDB = ()=> localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase));
const saveLocalOcc = ()=> localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache));
const loadLocalDB = ()=> { try { return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}'); } catch(e){ return {}; } };
const loadLocalOcc = ()=> { try { return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); } catch(e){ return []; } };
const loadPending = ()=> { try { return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); } catch(e){ return []; } };
const savePending = arr => localStorage.setItem(PENDING_KEY, JSON.stringify(arr||[]));

/* network UI */
function updateNetworkUI(){
  const el = qs('netStatus');
  const dot = qs('statusDot');
  if (!el) return;
  if (navigator.onLine){
    el.textContent = 'Online';
    el.classList.remove('off');
    if (dot) { dot.style.background = '#16a34a'; } // green
  } else {
    el.textContent = 'Offline';
    el.classList.add('off');
    if (dot) { dot.style.background = '#ef4444'; } // red
  }
}

/* API helpers */
async function apiGet(action){
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  const res = await fetch(url.toString());
  if(!res.ok) throw new Error('Network response not ok');
  return await res.json();
}

async function apiPost(action, body){
  const payload = Object.assign({action: action}, body || {});
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('Network response not ok');
  return await res.json();
}

/* Load errors & occurrences from API (or local fallback) */
async function fetchErrorsFromApi(){
  try {
    const json = await apiGet('getErrors');
    const list = Array.isArray(json) ? json : (json.errors || []);
    errorDatabase = {};
    list.forEach(r=>{
      const key = padKey(r.error_number || r.error_number || r.NO || r.NO || r["error_number"]);
      if(!key) return;
      errorDatabase[key] = {
        error_number: key,
        message: r.message || r.Message || '',
        cancel: r.cancel || '',
        detection: r.detection || '',
        'continue': r['continue'] || '',
        solution: r.solution || ''
      };
    });
    saveLocalDB();
    return true;
  } catch(err){
    console.error('fetchErrorsFromApi failed', err);
    return false;
  }
}

async function fetchOccurrencesFromApi(){
  try {
    const json = await apiGet('getOccurrences');
    const list = Array.isArray(json) ? json : (json.occurrences || []);
    occurrencesCache = list.map(r => ({
      occurrenceId: r.occurrenceId || r.occurrenceId || r["occurrenceId"] || r.occurrenceId || r["occurrenceId"],
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
    console.error('fetchOccurrencesFromApi failed', err);
    return false;
  }
}

/* populate dropdown */
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

/* render search result */
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
  // occurrences (accordion) matching this code
  const occs = (occurrencesCache || []).filter(o => padKey(o.error_number) === key);
  html += `<div style="margin-top:12px"><h3>Occurrences (${occs.length})</h3></div>`;
  // accordion list (reuse occList container UI too)
  const occHtml = renderAccordionList(key, occs);
  html += occHtml;
  html += `</div>`;
  resultDiv.innerHTML = html;
  // attach delete handlers
  attachAccordionHandlers();
}

/* render accordion HTML for occurrences list (or specific code) */
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

/* Render full Recent Occurrences panel (top-level) */
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
      // try server delete
      try {
        const json = await apiPost('deleteOccurrence', { occurrenceId: occid });
        if(json && json.status === 'ok'){
          // remove locally
          occurrencesCache = (occurrencesCache||[]).filter(o=> (o.occurrenceId||'') !== occid );
          saveLocalOcc();
          searchError(); renderRecentOccurrencesPanel();
          alert('Deleted.');
          return;
        } else {
          // server says not_found or error -> still remove locally if present
          occurrencesCache = (occurrencesCache||[]).filter(o=> (o.occurrenceId||'') !== occid );
          saveLocalOcc();
          searchError(); renderRecentOccurrencesPanel();
          alert('Deleted locally (server not reached).');
          return;
        }
      } catch(err){
        console.error(err);
        // offline -> queue deletion? For simplicity remove locally
        occurrencesCache = (occurrencesCache||[]).filter(o=> (o.occurrenceId||'') !== occid );
        saveLocalOcc();
        searchError(); renderRecentOccurrencesPanel();
        alert('Deleted locally (offline).');
      }
    };
  });
}

/* Add new error (POST) */
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
  // try online
  try {
    if(navigator.onLine){
      const res = await apiPost('addError', obj);
      if(res && res.status === 'ok') {
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
  // fallback: save locally
  errorDatabase[key] = obj;
  saveLocalDB();
  populateOccurrenceDropdown();
  toggleForm('errorForm', false);
  alert('Saved locally (offline).');
}

/* Add new occurrence */
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
    // read as base64
    try {
      const dataUrl = await fileToBase64(f);
      const parts = dataUrl.split(',');
      if(parts.length === 2){
        const mime = parts[0].split(':')[1].split(';')[0];
        const base64 = parts[1];
        occ.imageBase64 = base64;
        occ.imageMime = mime;
      }
    } catch(err){
      console.warn('image read failed', err);
    }
  }

  if(navigator.onLine){
    try {
      const res = await apiPost('addOccurrence', occ);
      if(res && res.status === 'ok'){
        occ.imageUrl = res.imageUrl || '';
        occurrencesCache.push(occ);
        saveLocalOcc();
        toggleForm('occurrenceForm', false);
        alert('Occurrence saved online.');
        // refresh UI if match
        const cur = padKey(qs('errorCode').value || '');
        if(cur === padKey(occ.error_number)) searchError();
        renderRecentOccurrencesPanel();
        return;
      }
    } catch(err){
      console.warn('addOccurrence online failed', err);
    }
  }
  // offline fallback: queue
  const pending = loadPending();
  pending.push(occ);
  savePending(pending);
  occurrencesCache.push(occ);
  saveLocalOcc();
  toggleForm('occurrenceForm', false);
  alert('Queued locally (offline).');
  renderRecentOccurrencesPanel();
}

/* file -> base64 */
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/* sync pending occurrences when back online */
async function syncPending(){
  const pending = loadPending();
  if(!pending.length) return;
  if(!navigator.onLine) return;
  const remaining = [];
  for(const p of pending){
    try {
      const res = await apiPost('addOccurrence', p);
      if(res && res.status === 'ok'){
        // update local occurrences (if local occ has same occurrenceId, update imageUrl)
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
  await loadRemoteData(); // refresh server data
}

/* toggle form utility */
function toggleForm(id, show){
  const el = qs(id);
  if(!el) return;
  if(typeof show === 'boolean') el.style.display = show ? 'block' : 'none';
  else el.style.display = el.style.display === 'block' ? 'none' : 'block';
  if(id === 'occurrenceForm') populateOccurrenceDropdown();
}

/* export/import */
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

/* init: load remote or local */
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
  // attach event listeners (buttons)
  attachUIEvents();
  // sync pending if online
  if(navigator.onLine) syncPending();
}

/* attach UI events */
function attachUIEvents(){
  // main buttons
  qs('btnSearch').onclick = searchError;
  qs('btnSaveError').onclick = saveNewError;
  qs('btnSaveOcc').onclick = saveNewOccurrence;
  qs('btnExport').onclick = exportDB;
  qs('importFile').onchange = importDB;
  qs('btnExport').onkeydown = e => { if(e.key==='Enter') exportDB(); };

  // toggles
  document.querySelectorAll('.toggle-form').forEach(b=>{
    b.onclick = ()=> toggleForm(b.getAttribute('data-target'));
  });
  document.querySelectorAll('.btn-cancel').forEach(b=>{
    b.onclick = ()=> { toggleForm(b.getAttribute('data-target'), false); };
  });
  // enter key handlers: password, search, forms
  const pass = qs('passwordInput'); if(pass) pass.onkeydown = e=>{ if(e.key==='Enter') checkPassword(); };
  const search = qs('errorCode'); if(search) search.onkeydown = e=>{ if(e.key==='Enter') searchError(); };
  // forms: pressing Enter in last field triggers save
  const lastErrorField = qs('newSolution'); if(lastErrorField) lastErrorField.onkeydown = e=>{ if(e.key==='Enter') saveNewError(); };
  const lastOccField = qs('occurrenceParts'); if(lastOccField) lastOccField.onkeydown = e=>{ if(e.key==='Enter') saveNewOccurrence(); };
}

/* check password */
function checkPassword(){
  if(qs('passwordInput').value === CORRECT_PASSWORD){
    qs('passwordOverlay').style.display = 'none';
    qs('mainContainer').style.display = 'block';
    loadRemoteData();
  } else {
    alert('Incorrect password');
  }
}

/* initial DOMContentLoaded */
document.addEventListener('DOMContentLoaded', ()=>{
  updateNetworkUI();
  window.addEventListener('online', ()=>{ updateNetworkUI(); syncPending(); });
  window.addEventListener('offline', ()=>{ updateNetworkUI(); });
  // initial attach for Access button (password overlay)
  const accessBtn = qs('btnAccess'); if(accessBtn) accessBtn.onclick = checkPassword;
});

/* render initial (in case opened after password) */
(function(){
  // nothing here - main init after password
})();
