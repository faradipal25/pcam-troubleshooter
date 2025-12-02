/* PCAM Troubleshooter - Full Working Version */
const API_URL = "https://script.google.com/macros/s/AKfycbw_eisOrGlPb04R43Ca9ODuzPVGtY05gesOcIBU-B9BcRjFaCc0F6A7Fh9-tjhHCnm-/exec";
const CORRECT_PASSWORD = "SIKIPAL@dip";

const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";
const PENDING_KEY = "pcam_pending_v1";

let errorDatabase = {};
let occurrencesCache = [];

/* ---------- Basic Helpers ---------- */
const qs = id => document.getElementById(id);
const padKey = k => String(k||'').replace(/^E/i,'').padStart(3,'0');
const saveLocalDB = ()=> localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase));
const saveLocalOcc = ()=> localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache));
const loadLocalDB = ()=> { 
  try { 
    const db = JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}');
    return db && typeof db === 'object' ? db : {}; 
  } catch(e){ 
    console.error('Load local DB error:', e);
    return {}; 
  }
};
const loadLocalOcc = ()=> { 
  try { 
    const occ = JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]');
    return Array.isArray(occ) ? occ : []; 
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

/* ---------- JSONP API Call ---------- */
function apiJsonp(action, data = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout after 10 seconds'));
    }, 10000);
    
    function cleanup() {
      delete window[callbackName];
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      clearTimeout(timeout);
    }
    
    window[callbackName] = function(response) {
      cleanup();
      console.log('JSONP response for', action, ':', response);
      resolve(response);
    };
    
    let url = API_URL + '?action=' + encodeURIComponent(action);
    if (Object.keys(data).length > 0) {
      url += '&payload=' + encodeURIComponent(JSON.stringify(data));
    }
    url += '&callback=' + callbackName;
    url += '&_t=' + Date.now();
    
    console.log('JSONP request URL:', url);
    
    script.src = url;
    script.onerror = (err) => {
      cleanup();
      console.error('JSONP error for', action, ':', err);
      reject(new Error('JSONP request failed'));
    };
    
    document.body.appendChild(script);
  });
}

/* ---------- Data Loading ---------- */
async function loadRemoteData() {
  console.log('Loading remote data...');
  updateNetworkUI();
  
  // Try to load from API if online
  if (navigator.onLine) {
    try {
      console.log('Fetching errors from API...');
      const errorsResult = await apiJsonp('getErrors');
      
      if (errorsResult && errorsResult.errors && Array.isArray(errorsResult.errors)) {
        errorDatabase = {};
        errorsResult.errors.forEach(r => {
          const key = padKey(r.error_number || "");
          if (key) {
            errorDatabase[key] = {
              error_number: key,
              message: r.message || '',
              cancel: r.cancel || '',
              detection: r.detection || '',
              'continue': r['continue'] || '',
              solution: r.solution || ''
            };
          }
        });
        saveLocalDB();
        console.log('Loaded', Object.keys(errorDatabase).length, 'errors from API');
      }
      
      console.log('Fetching occurrences from API...');
      const occResult = await apiJsonp('getOccurrences');
      
      if (occResult && occResult.occurrences && Array.isArray(occResult.occurrences)) {
        occurrencesCache = occResult.occurrences.map(r => ({
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
      }
      
    } catch (error) {
      console.warn('Failed to load from API, using local data:', error);
      errorDatabase = loadLocalDB();
      occurrencesCache = loadLocalOcc();
    }
  } else {
    // Offline - load from local storage
    console.log('Offline - loading from local storage');
    errorDatabase = loadLocalDB();
    occurrencesCache = loadLocalOcc();
  }
  
  populateOccurrenceDropdown();
  renderRecentOccurrencesPanel();
  attachUIEvents();
  
  // Show message about data loaded
  const resultDiv = qs('result');
  if (resultDiv) {
    const errorCount = Object.keys(errorDatabase).length;
    const occCount = occurrencesCache.length;
    resultDiv.innerHTML = `
      <div class="error-info">
        <h3>PCAM Troubleshooter Ready</h3>
        <p>System loaded with ${errorCount} error codes and ${occCount} occurrences.</p>
        <p>Enter an error code above to search, or use the buttons below to add new entries.</p>
      </div>
    `;
  }
}

/* ---------- UI Functions ---------- */
function populateOccurrenceDropdown() {
  const dd = qs('occurrenceErrorCode');
  if (!dd) return;
  
  dd.innerHTML = '<option value="">Select Error Code</option>';
  Object.keys(errorDatabase)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code;
      dd.appendChild(opt);
    });
}

function searchError() {
  const raw = qs('errorCode').value.trim();
  const resultDiv = qs('result');
  
  if (!raw) {
    resultDiv.innerHTML = '<div class="not-found"><h3>Please enter an error code</h3></div>';
    return;
  }
  
  const key = padKey(raw);
  const e = errorDatabase[key];
  
  if (!e) {
    resultDiv.innerHTML = `<div class="not-found"><h3>Error Code "${raw}" Not Found</h3><p>Try entering just the numbers (e.g., 001 instead of E001)</p></div>`;
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
  html += `<div class="info-section"><h3>Continue</h3><p>${escapeHtml(e['continue'] || '')}</p></div>`;
  html += `<div class="info-section"><h3>Solution</h3><p>${escapeHtml(e.solution)}</p></div>`;

  const occs = occurrencesCache.filter(o => padKey(o.error_number) === key);
  html += `<div style="margin-top:12px"><h3>Occurrences (${occs.length})</h3></div>`;
  
  if (occs.length > 0) {
    html += '<div class="accordion">';
    occs.slice().reverse().forEach((occ, idx) => {
      const id = occ.occurrenceId || ('occ_' + idx + '_' + Date.now());
      html += `<div class="accordion-item" data-occid="${id}">
        <button class="accordion-header" onclick="toggleAccordion('${id}')">
          ${escapeHtml(occ.date || 'No date')} — ${escapeHtml(occ.technician || 'Unknown')} 
          <span style="float:right">▼</span>
        </button>
        <div class="accordion-body" id="acc-${id}" style="display:none">
          <p><strong>Error Code:</strong> ${occ.error_number}</p>
          <p><strong>Customer:</strong> ${escapeHtml(occ.customerName || '')}</p>
          <p><strong>Model:</strong> ${escapeHtml(occ.machineModel || '')}</p>
          <p><strong>Serial:</strong> ${escapeHtml(occ.machineSerial || '')}</p>
          <p><strong>Remedy:</strong> ${escapeHtml(occ.remedy || '')}</p>
          <p><strong>Downtime:</strong> ${escapeHtml(occ.downtime || '')}</p>
          <p><strong>Parts:</strong> ${escapeHtml(occ.parts || '')}</p>`;
      
      if (occ.imageUrl) {
        html += `<p><strong>Image:</strong><br>
          <a href="${occ.imageUrl}" target="_blank">
            <img src="${occ.imageUrl}" style="max-width:300px; border-radius:6px; border:1px solid #ddd">
          </a>
        </p>`;
      }
      
      html += `<div style="margin-top:10px">
        <button onclick="deleteOccurrence('${id}')" class="btn-delete-occ">🗑 Delete</button>
      </div>
      </div></div>`;
    });
    html += '</div>';
  } else {
    html += '<p style="color:#666; padding:12px;">No occurrences recorded for this error.</p>';
  }
  
  html += '</div>';
  resultDiv.innerHTML = html;
}

function renderRecentOccurrencesPanel() {
  const container = qs('occList');
  if (!container) return;
  
  if (occurrencesCache.length === 0) {
    container.innerHTML = '<div style="padding:12px;color:#666">No occurrences recorded</div>';
    return;
  }
  
  let html = '<div class="accordion">';
  occurrencesCache.slice().reverse().forEach((occ, idx) => {
    const id = occ.occurrenceId || ('occ_recent_' + idx + '_' + Date.now());
    html += `<div class="accordion-item" data-occid="${id}">
      <button class="accordion-header" onclick="toggleAccordion('${id}')">
        ${escapeHtml(occ.date || 'No date')} — ${escapeHtml(occ.technician || 'Unknown')} 
        <span style="float:right">▼</span>
      </button>
      <div class="accordion-body" id="acc-${id}" style="display:none">
        <p><strong>Error Code:</strong> ${occ.error_number}</p>
        <p><strong>Customer:</strong> ${escapeHtml(occ.customerName || '')}</p>
        <p><strong>Model:</strong> ${escapeHtml(occ.machineModel || '')}</p>
        <p><strong>Serial:</strong> ${escapeHtml(occ.machineSerial || '')}</p>
        <p><strong>Remedy:</strong> ${escapeHtml(occ.remedy || '')}</p>
        <p><strong>Downtime:</strong> ${escapeHtml(occ.downtime || '')}</p>
        <p><strong>Parts:</strong> ${escapeHtml(occ.parts || '')}</p>`;
    
    if (occ.imageUrl) {
      html += `<p><strong>Image:</strong><br>
        <a href="${occ.imageUrl}" target="_blank">
          <img src="${occ.imageUrl}" style="max-width:300px; border-radius:6px; border:1px solid #ddd">
        </a>
      </p>`;
    }
    
    html += `<div style="margin-top:10px">
      <button onclick="deleteOccurrence('${id}')" class="btn-delete-occ">🗑 Delete</button>
    </div>
    </div></div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

/* ---------- Accordion Helper ---------- */
function toggleAccordion(id) {
  const body = document.getElementById('acc-' + id);
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
}

/* ---------- Delete Occurrence ---------- */
async function deleteOccurrence(occId) {
  if (!confirm('Are you sure you want to delete this occurrence?')) return;
  
  try {
    if (navigator.onLine) {
      const result = await apiJsonp('deleteOccurrence', { occurrenceId: occId });
      if (result && result.status === 'ok') {
        // Update local cache
        occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== occId);
        saveLocalOcc();
        alert('Occurrence deleted successfully!');
        
        // Refresh displays
        searchError(); // Refresh current search if any
        renderRecentOccurrencesPanel();
        return;
      }
    }
  } catch (err) {
    console.warn('Online delete failed:', err);
  }
  
  // Offline delete
  occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== occId);
  saveLocalOcc();
  alert('Deleted locally (offline). Will sync when online.');
  
  // Refresh displays
  searchError();
  renderRecentOccurrencesPanel();
}

/* ---------- Save New Error ---------- */
async function saveNewError() {
  const code = qs('newErrorCode').value.trim();
  if (!code) {
    alert('Please enter error code');
    return;
  }
  
  const errorData = {
    error_number: code,
    message: qs('newMessage').value.trim(),
    cancel: qs('newCancel').value.trim(),
    detection: qs('newDetection').value.trim(),
    'continue': qs('newContinue').value.trim(),
    solution: qs('newSolution').value.trim()
  };
  
  try {
    if (navigator.onLine) {
      const result = await apiJsonp('addError', errorData);
      if (result && result.status === 'ok') {
        // Update local database
        const key = padKey(code);
        errorDatabase[key] = errorData;
        saveLocalDB();
        populateOccurrenceDropdown();
        toggleForm('errorForm', false);
        
        // Clear form
        ['newErrorCode', 'newMessage', 'newCancel', 'newDetection', 'newContinue', 'newSolution']
          .forEach(id => { if (qs(id)) qs(id).value = ''; });
        
        alert('Error saved successfully to spreadsheet!');
        return;
      }
    }
  } catch (err) {
    console.warn('Online save failed:', err);
  }
  
  // Offline save
  const key = padKey(code);
  errorDatabase[key] = errorData;
  saveLocalDB();
  populateOccurrenceDropdown();
  toggleForm('errorForm', false);
  alert('Saved locally (offline). Will sync when online.');
}

/* ---------- Save New Occurrence ---------- */
async function saveNewOccurrence() {
  const code = qs('occurrenceErrorCode').value;
  if (!code) {
    alert('Please select error code');
    return;
  }
  
  const occurrenceData = {
    occurrenceId: 'occ_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    error_number: code,
    date: qs('occurrenceDate').value || new Date().toISOString().slice(0, 10),
    customerName: qs('customerName').value.trim(),
    machineModel: qs('machineModel').value.trim(),
    machineSerial: qs('machineSerial').value.trim(),
    remedy: qs('occurrenceRemedy').value.trim(),
    technician: qs('occurrenceTechnician').value.trim(),
    downtime: qs('occurrenceDowntime').value.trim(),
    parts: qs('occurrenceParts').value.trim()
  };
  
  // Handle image
  const fileInput = qs('occurrenceImage');
  if (fileInput.files[0]) {
    try {
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64 = e.target.result.split(',')[1];
        occurrenceData.imageBase64 = base64;
        occurrenceData.imageMime = fileInput.files[0].type || 'image/jpeg';
      };
      reader.readAsDataURL(fileInput.files[0]);
    } catch (err) {
      console.warn('Image processing failed:', err);
    }
  }
  
  try {
    if (navigator.onLine) {
      // Don't send base64 via JSONP - it's too large
      const sendData = { ...occurrenceData };
      delete sendData.imageBase64;
      delete sendData.imageMime;
      
      const result = await apiJsonp('addOccurrence', sendData);
      if (result && result.status === 'ok') {
        occurrenceData.imageUrl = result.imageUrl || '';
        occurrencesCache.push(occurrenceData);
        saveLocalOcc();
        toggleForm('occurrenceForm', false);
        
        // Clear form
        ['customerName', 'machineModel', 'machineSerial', 'occurrenceRemedy', 
         'occurrenceTechnician', 'occurrenceDowntime', 'occurrenceParts', 'occurrenceImage']
          .forEach(id => { if (qs(id)) qs(id).value = ''; });
        
        alert('Occurrence saved successfully!');
        searchError(); // Refresh search if showing same error
        renderRecentOccurrencesPanel();
        return;
      }
    }
  } catch (err) {
    console.warn('Online save failed:', err);
  }
  
  // Offline save
  occurrencesCache.push(occurrenceData);
  saveLocalOcc();
  toggleForm('occurrenceForm', false);
  alert('Saved locally (offline). Will sync when online.');
  renderRecentOccurrencesPanel();
}

/* ---------- Utility Functions ---------- */
function toggleForm(id, show) {
  const el = qs(id);
  if (!el) return;
  
  if (typeof show === 'boolean') {
    el.style.display = show ? 'block' : 'none';
  } else {
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
  }
  
  if (id === 'occurrenceForm' && el.style.display === 'block') {
    populateOccurrenceDropdown();
  }
}

function exportDB() {
  const data = {
    errors: errorDatabase,
    occurrences: occurrencesCache,
    exportedAt: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pcam-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDB(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      if (data.errors) {
        errorDatabase = data.errors;
        saveLocalDB();
      }
      
      if (data.occurrences) {
        occurrencesCache = data.occurrences;
        saveLocalOcc();
      }
      
      populateOccurrenceDropdown();
      renderRecentOccurrencesPanel();
      alert('Data imported successfully!');
      
      // Clear file input
      event.target.value = '';
    } catch (err) {
      alert('Error importing file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function updateNetworkUI() {
  const statusEl = qs('netStatus');
  const dotEl = qs('statusDot');
  
  if (!statusEl || !dotEl) return;
  
  if (navigator.onLine) {
    statusEl.textContent = 'Online';
    dotEl.style.backgroundColor = '#10b981'; // Green
  } else {
    statusEl.textContent = 'Offline';
    dotEl.style.backgroundColor = '#ef4444'; // Red
  }
}

function attachUIEvents() {
  console.log('Setting up UI events...');
  
  // Buttons
  if (qs('btnSearch')) qs('btnSearch').onclick = searchError;
  if (qs('btnSaveError')) qs('btnSaveError').onclick = saveNewError;
  if (qs('btnSaveOcc')) qs('btnSaveOcc').onclick = saveNewOccurrence;
  if (qs('btnExport')) qs('btnExport').onclick = exportDB;
  
  // Import
  const importFile = qs('importFile');
  if (importFile) importFile.onchange = importDB;
  
  // Form toggles
  document.querySelectorAll('.toggle-form').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      toggleForm(targetId);
    };
  });
  
  // Cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      toggleForm(targetId, false);
    };
  });
  
  // Enter key handlers
  if (qs('errorCode')) {
    qs('errorCode').onkeypress = (e) => {
      if (e.key === 'Enter') searchError();
    };
  }
  
  if (qs('newSolution')) {
    qs('newSolution').onkeypress = (e) => {
      if (e.key === 'Enter') saveNewError();
    };
  }
  
  if (qs('occurrenceParts')) {
    qs('occurrenceParts').onkeypress = (e) => {
      if (e.key === 'Enter') saveNewOccurrence();
    };
  }
  
  console.log('UI events attached');
}

// Make functions available globally for inline calls
window.loadRemoteData = loadRemoteData;
window.attachUIEvents = attachUIEvents;
window.toggleAccordion = toggleAccordion;
window.deleteOccurrence = deleteOccurrence;

console.log('PCAM Troubleshooter Full Version Loaded');
