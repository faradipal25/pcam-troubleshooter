/* PCAM Troubleshooter - Complete Working Script */
const API_URL = "https://script.google.com/macros/s/AKfycbzT4CRaxrwTM2V19dL7K_DrkijBehcHo9tI4kT29sniIq-WXLqHq2keEX7UbLM3JizO/exec";
const CORRECT_PASSWORD = "SIKIPAL@dip";

const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";
const PENDING_KEY = "pcam_pending_v1";

let errorDatabase = {};
let occurrencesCache = [];

/* ---------- helpers ---------- */
const qs = id => document.getElementById(id);
const padKey = k => String(k||'').replace(/^E/i,'').padStart(3,'0');
const saveLocalDB = ()=> localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase));
const saveLocalOcc = ()=> localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache));
const loadLocalDB = ()=> { 
  try { 
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}'); 
  } catch(e){ 
    console.error('Load local DB error:', e);
    return {}; 
  }
};
const loadLocalOcc = ()=> { 
  try { 
    return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); 
  } catch(e){ 
    console.error('Load local occurrences error:', e);
    return []; 
  }
};
const loadPending = ()=> { 
  try { 
    return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); 
  } catch(e){ 
    console.error('Load pending error:', e);
    return []; 
  }
};
const savePending = arr => localStorage.setItem(PENDING_KEY, JSON.stringify(arr||[]));

/* ---------- IMPROVED JSONP API Helper ---------- */
function apiJsonp(action, body) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout after 10 seconds'));
    }, 10000);
    
    function cleanup() {
      delete window[callbackName];
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      clearTimeout(timeoutId);
    }
    
    window[callbackName] = function(response) {
      cleanup();
      console.log('JSONP response for', action, ':', response);
      resolve(response);
    };
    
    let url = API_URL + "?action=" + encodeURIComponent(action);
    if (body) {
      url += "&payload=" + encodeURIComponent(JSON.stringify(body));
    }
    url += "&callback=" + callbackName;
    url += "&_t=" + Date.now();
    
    console.log('JSONP request URL:', url);
    
    script.src = url;
    script.onerror = (error) => {
      cleanup();
      console.error('JSONP script error for', action, ':', error);
      reject(new Error(`JSONP request failed: ${error.message}`));
    };
    
    document.body.appendChild(script);
  });
}

/* ---------- SIMPLE FETCH FALLBACK ---------- */
async function simpleFetch(action, body) {
  try {
    let url = API_URL + "?action=" + encodeURIComponent(action);
    if (body) {
      url += "&payload=" + encodeURIComponent(JSON.stringify(body));
    }
    url += "&_t=" + Date.now();
    
    console.log('Trying simple fetch for:', action);
    
    // Try without mode: 'cors' which might bypass CORS issues
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });
    
    const text = await response.text();
    console.log('Simple fetch response:', text.substring(0, 200));
    
    try {
      return JSON.parse(text);
    } catch(e) {
      // If it's not JSON, it might be JSONP
      if (text.includes('(') && text.includes(')')) {
        // Extract JSON from JSONP
        const jsonStart = text.indexOf('(') + 1;
        const jsonEnd = text.lastIndexOf(')');
        const jsonStr = text.substring(jsonStart, jsonEnd);
        return JSON.parse(jsonStr);
      }
      throw new Error('Invalid response format');
    }
  } catch(err) {
    console.error('Simple fetch failed:', err);
    throw err;
  }
}

/* ---------- HYBRID API CALLER ---------- */
async function apiCall(action, body) {
  try {
    // First try JSONP
    return await apiJsonp(action, body);
  } catch(jsonpError) {
    console.warn('JSONP failed, trying simple fetch:', jsonpError);
    try {
      // Fallback to simple fetch
      return await simpleFetch(action, body);
    } catch(fetchError) {
      console.error('All API methods failed for', action);
      throw fetchError;
    }
  }
}

/* ---------- Fetch Errors ---------- */
async function fetchErrorsFromApi(){
  try {
    const json = await apiCall('getErrors');
    const list = Array.isArray(json) ? json : (json.errors || []);
    errorDatabase = {};
    list.forEach(r => {
      const key = padKey(r.error_number || "");
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
    console.log('Loaded', Object.keys(errorDatabase).length, 'errors from API');
    return true;
  } catch(err){
    console.warn('fetchErrorsFromApi failed', err);
    return false;
  }
}

/* ---------- Fetch Occurrences ---------- */
async function fetchOccurrencesFromApi(){
  try {
    const json = await apiCall('getOccurrences');
    const list = Array.isArray(json) ? json : (json.occurrences || []);
    occurrencesCache = list.map(r => ({
      occurrenceId: r.occurrenceId || '',
      error_number: padKey(r.error_number || ""),
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
    console.log('Loaded', occurrencesCache.length, 'occurrences from API');
    return true;
  } catch(err){
    console.warn('fetchOccurrencesFromApi failed', err);
    return false;
  }
}

/* ---------- Load Remote Data (THIS WAS MISSING) ---------- */
async function loadRemoteData(){
  let onlineSuccess = false;
  
  if(navigator.onLine){
    try {
      onlineSuccess = await fetchErrorsFromApi();
      if(onlineSuccess) {
        await fetchOccurrencesFromApi();
      }
    } catch(err) {
      console.error('Online load failed:', err);
    }
  }
  
  if(!onlineSuccess){
    console.log('Loading from local storage...');
    errorDatabase = loadLocalDB();
    occurrencesCache = loadLocalOcc();
  }
  
  populateOccurrenceDropdown(); 
  renderRecentOccurrencesPanel(); 
  attachUIEvents();
}

/* ---------- UI helpers ---------- */
function populateOccurrenceDropdown(){
  const dd = qs('occurrenceErrorCode'); 
  if(!dd) return;
  
  dd.innerHTML = '<option value="">Select Error Code</option>';
  Object.keys(errorDatabase)
    .sort((a,b) => Number(a) - Number(b))
    .forEach(code => {
      const opt = document.createElement('option');
      opt.value = code; 
      opt.textContent = code;
      dd.appendChild(opt);
    });
}

function escapeHtml(s){ 
  if(!s) return ''; 
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>'); 
}

/* ---------- Search and Display ---------- */
function searchError(){
  const raw = qs('errorCode').value.trim(); 
  const resultDiv = qs('result');
  
  if(!raw){ 
    resultDiv.innerHTML = `<div class="not-found"><h3>Please enter an error code</h3></div>`; 
    return; 
  }
  
  const key = padKey(raw); 
  const e = errorDatabase[key];
  
  if(!e){ 
    resultDiv.innerHTML = `<div class="not-found"><h3>Error Code "${raw}" Not Found</h3></div>`; 
    return; 
  }

  let html = `<div class="error-info">
    <div class="error-header">
      <h2 style="color:#1e3c72">Error Code Details</h2>
      <div class="error-code">${key}</div>
    </div>`;
  
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

function renderAccordionList(filterKey, list){
  if(!list || !list.length) return `<div style="padding:12px;color:#666">No previous occurrences recorded.</div>`;
  
  let html = '<div class="accordion">';
  list.slice().reverse().forEach((occ, idx) => {
    const id = occ.occurrenceId || ('occ_local_'+idx+'_'+(Date.now()%10000));
    const title = `${escapeHtml(occ.date||'')} — ${escapeHtml(occ.technician||'')}`;
    
    html += `<div class="accordion-item" data-occid="${id}">
      <button class="accordion-header" data-occid="${id}" aria-expanded="false">
        ${escapeHtml(title)} <span style="float:right">▼</span>
      </button>
      <div class="accordion-body" data-occid="${id}" style="display:none">
        <p><strong>Error Code:</strong> ${escapeHtml(occ.error_number)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(occ.customerName||'')}</p>
        <p><strong>Model:</strong> ${escapeHtml(occ.machineModel||'')}</p>
        <p><strong>Serial:</strong> ${escapeHtml(occ.machineSerial||'')}</p>
        <p><strong>Remedy:</strong> ${escapeHtml(occ.remedy||'')}</p>
        <p><strong>Downtime:</strong> ${escapeHtml(occ.downtime||'')}</p>
        <p><strong>Parts:</strong> ${escapeHtml(occ.parts||'')}</p>`;
    
    if(occ.imageUrl) {
      html += `<p><strong>Image:</strong><br>
        <a href="${occ.imageUrl}" target="_blank">
          <img src="${occ.imageUrl}" style="max-width:320px;border-radius:6px;border:1px solid #ddd" />
        </a>
      </p>`;
    }
    
    html += `<div style="margin-top:8px">
      <button class="btn-delete-occ" data-occid="${id}">🗑 Delete</button>
    </div>`;
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

function attachAccordionHandlers(){
  // Accordion toggle
  document.querySelectorAll('.accordion-header').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-occid');
      const body = document.querySelector(`.accordion-body[data-occid="${id}"]`);
      if(!body) return;
      
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      body.style.display = expanded ? 'none' : 'block';
    };
  });
  
  // Delete buttons
  document.querySelectorAll('.btn-delete-occ').forEach(b => {
    b.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const occid = b.getAttribute('data-occid');
      if(!occid) return;
      
      if(!confirm('Are you sure you want to delete this occurrence?')) return;
      
      try {
        if(navigator.onLine){
          const res = await deleteOccurrenceFromApi(occid);
          
          if(res && res.status === 'ok'){
            // Update from API response if available
            if(res.occurrences && Array.isArray(res.occurrences)) {
              occurrencesCache = res.occurrences.map(r => ({
                occurrenceId: r.occurrenceId || '',
                error_number: padKey(r.error_number || ""),
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
            } else {
              // Remove from local cache
              occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== occid);
            }
            
            saveLocalOcc();
            alert('Occurrence deleted successfully!');
            
            // Refresh displays
            searchError(); 
            renderRecentOccurrencesPanel();
            return;
          } else {
            throw new Error(res?.message || 'Delete failed');
          }
        }
      } catch(err) { 
        console.warn('Online delete failed:', err);
      }
      
      // Offline delete
      occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== occid);
      saveLocalOcc();
      alert('Deleted locally (offline).');
      
      // Refresh displays
      searchError(); 
      renderRecentOccurrencesPanel();
    };
  });
}

/* ---------- Add New Error ---------- */
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
        // Update local cache from response
        if(res.errors && Array.isArray(res.errors)) {
          errorDatabase = {};
          res.errors.forEach(r => {
            const k = padKey(r.error_number || "");
            if(k) {
              errorDatabase[k] = {
                error_number: k,
                message: r.message || '',
                cancel: r.cancel || '',
                detection: r.detection || '',
                'continue': r['continue'] || '',
                solution: r.solution || ''
              };
            }
          });
        } else {
          errorDatabase[key] = obj;
        }
        
        saveLocalDB();
        populateOccurrenceDropdown();
        toggleForm('errorForm', false);
        
        // Clear form
        ['newErrorCode','newMessage','newCancel','newDetection','newContinue','newSolution']
          .forEach(id => { if(qs(id)) qs(id).value = ''; });
        
        alert('Error added successfully!');
        return;
      }
    }
  } catch(e){ 
    console.warn('Online save failed:', e);
  }
  
  // Offline save
  errorDatabase[key] = obj;
  saveLocalDB();
  populateOccurrenceDropdown();
  toggleForm('errorForm', false);
  alert('Saved locally (offline).');
}

/* ---------- Image Helper ---------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result.split(',')[1];
      resolve({ base64: base64, mime: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Delete Occurrence API ---------- */
async function deleteOccurrenceFromApi(occid) {
  try {
    const res = await apiCall('deleteOccurrence', { occurrenceId: occid });
    if(res && res.status === 'ok'){
      return res;
    }
    return null;
  } catch(err) {
    console.warn('Delete API call failed:', err);
    return null;
  }
}

/* ---------- Add New Occurrence ---------- */
async function saveNewOccurrence(){
  const code = qs('occurrenceErrorCode').value; 
  if(!code){ alert('Select error code'); return; }
  
  const occ = {
    occurrenceId: "occ_" + Date.now() + "_" + Math.floor(Math.random()*9000+1000),
    error_number: code,
    date: qs('occurrenceDate').value || new Date().toISOString().slice(0,10),
    customerName: qs('customerName').value.trim(),
    machineModel: qs('machineModel').value.trim(),
    machineSerial: qs('machineSerial').value.trim(),
    remedy: qs('occurrenceRemedy').value.trim(),
    technician: qs('occurrenceTechnician').value.trim(),
    downtime: qs('occurrenceDowntime').value.trim(),
    parts: qs('occurrenceParts').value.trim()
  };

  // Handle image
  const f = qs('occurrenceImage').files[0];
  if(f){
    try {
      const { base64, mime } = await fileToBase64(f);
      occ.imageBase64 = base64;
      occ.imageMime = mime;
    } catch(err){ 
      console.warn('Image processing failed:', err);
    }
  }

  // Save occurrence
  try {
    if(navigator.onLine){
      const sendObj = {...occ};
      
      // Don't send large base64 via JSONP
      delete sendObj.imageBase64;
      delete sendObj.imageMime;
      
      const res = await apiCall('addOccurrence', sendObj);
      
      if(res && res.status === 'ok'){
        occ.imageUrl = occ.imageUrl || '';
        occurrencesCache.push(occ);
        saveLocalOcc();
        toggleForm('occurrenceForm', false);
        
        // Clear form
        const occFields = ['customerName','machineModel','machineSerial',
                          'occurrenceRemedy','occurrenceTechnician',
                          'occurrenceDowntime','occurrenceParts','occurrenceImage'];
        occFields.forEach(id => { if(qs(id)) qs(id).value = ''; });
        if(qs('occurrenceDate')) qs('occurrenceDate').value = new Date().toISOString().slice(0,10);
        
        alert('Occurrence saved successfully!');
        
        // Refresh displays
        const currentCode = padKey(qs('errorCode').value || '');
        if(currentCode === code) searchError();
        renderRecentOccurrencesPanel();
        return;
      }
    }
  } catch(err){ 
    console.warn('Online occurrence save failed:', err);
  }
  
  // Offline save
  occ.imageUrl = occ.imageUrl || '';
  occurrencesCache.push(occ);
  saveLocalOcc();
  toggleForm('occurrenceForm', false);
  
  alert('Saved locally (offline).');
  renderRecentOccurrencesPanel();
}

/* ---------- toggle form ---------- */
function toggleForm(id, show){
  const el = qs(id); 
  if(!el) return;
  
  if(typeof show === 'boolean') {
    el.style.display = show ? 'block' : 'none';
  } else {
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
  }
  
  if(id === 'occurrenceForm' && el.style.display === 'block') {
    populateOccurrenceDropdown();
  }
}

/* ---------- export/import ---------- */
function exportDB(){
  const payload = { 
    errors: errorDatabase, 
    occurrences: occurrencesCache,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(blob);
  a.download = 'pcam_db_export_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.json';
  document.body.appendChild(a); 
  a.click(); 
  a.remove();
}

function importDB(e){
  const f = e.target.files[0]; 
  if(!f) return;
  
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      
      if(obj.errors && typeof obj.errors === 'object') { 
        errorDatabase = obj.errors; 
        saveLocalDB(); 
      }
      
      if(obj.occurrences && Array.isArray(obj.occurrences)) { 
        occurrencesCache = obj.occurrences; 
        saveLocalOcc(); 
      }
      
      populateOccurrenceDropdown(); 
      renderRecentOccurrencesPanel(); 
      alert('Import complete!');
      
      // Clear file input
      e.target.value = '';
    } catch(err) { 
      alert('Import failed: ' + err.message); 
    }
  };
  fr.readAsText(f);
}

/* ---------- attach UI events ---------- */
function attachUIEvents(){
  // Search
  const btnSearch = qs('btnSearch'); 
  if(btnSearch) btnSearch.onclick = searchError;
  
  // Save buttons
  const btnSaveError = qs('btnSaveError'); 
  if(btnSaveError) btnSaveError.onclick = saveNewError;
  
  const btnSaveOcc = qs('btnSaveOcc'); 
  if(btnSaveOcc) btnSaveOcc.onclick = saveNewOccurrence;
  
  // Export/Import
  const btnExport = qs('btnExport'); 
  if(btnExport) btnExport.onclick = exportDB;
  
  const importFile = qs('importFile'); 
  if(importFile) importFile.onchange = importDB;
  
  // Form toggles
  document.querySelectorAll('.toggle-form').forEach(b => {
    b.onclick = () => toggleForm(b.getAttribute('data-target'));
  });
  
  // Cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(b => {
    b.onclick = () => toggleForm(b.getAttribute('data-target'), false);
  });

  // Enter key handlers
  const search = qs('errorCode'); 
  if(search) search.onkeydown = e => { if(e.key==='Enter') searchError(); };
  
  const lastErrorField = qs('newSolution'); 
  if(lastErrorField) lastErrorField.onkeydown = e => { if(e.key==='Enter') saveNewError(); };
  
  const lastOccField = qs('occurrenceParts'); 
  if(lastOccField) lastOccField.onkeydown = e => { if(e.key==='Enter') saveNewOccurrence(); };

  // Import label
  const importLabel = document.querySelector('label[for="importFile"]'); 
  if(importLabel) importLabel.onclick = () => qs('importFile').click();
}

/* ---------- password ---------- */
function checkPassword(){
  const p = qs('passwordInput').value;
  console.log('Password entered:', p);
  if(p === CORRECT_PASSWORD){
    qs('passwordOverlay').style.display = 'none';
    qs('mainContainer').style.display = 'block';
    loadRemoteData(); // Now this function is defined
  } else {
    alert('Incorrect password');
  }
}

/* ---------- Network status ---------- */
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

/* ---------- DOM ready ---------- */
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded');
  
  // Set up network status
  updateNetworkUI();
  window.addEventListener('online', () => { 
    updateNetworkUI(); 
  });
  window.addEventListener('offline', () => { 
    updateNetworkUI(); 
  });
  
  // Set up password access
  const accessBtn = qs('btnAccess');
  if(accessBtn) {
    console.log('Found access button');
    accessBtn.addEventListener('click', checkPassword);
  }
  
  // Allow Enter key in password field
  const passwordInput = qs('passwordInput');
  if(passwordInput) {
    passwordInput.addEventListener('keydown', function(e) {
      if(e.key === 'Enter') {
        checkPassword();
      }
    });
  }
});

/* debug accessor */
window.__pcam = { 
  apiCall, 
  apiJsonp,
  simpleFetch,
  loadRemoteData,
  errorDatabase,
  occurrencesCache
};
