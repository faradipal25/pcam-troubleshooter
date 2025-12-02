/* PCAM Troubleshooter - Simplified Working Version */
const API_URL = "https://script.google.com/macros/s/AKfycbw_eisOrGlPb04R43Ca9ODuzPVGtY05gesOcIBU-B9BcRjFaCc0F6A7Fh9-tjhHCnm-/exec";
const CORRECT_PASSWORD = "SIKIPAL@dip";

const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";

let errorDatabase = {};
let occurrencesCache = [];

/* ---------- Basic Helpers ---------- */
const qs = id => document.getElementById(id);
const padKey = k => String(k||'').replace(/^E/i,'').padStart(3,'0');
const saveLocalDB = ()=> localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase));
const saveLocalOcc = ()=> localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache));
const loadLocalDB = ()=> { 
  try { 
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}'); 
  } catch(e){ 
    return {}; 
  }
};
const loadLocalOcc = ()=> { 
  try { 
    return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); 
  } catch(e){ 
    return []; 
  }
};

/* ---------- SIMPLE JSONP CALL ---------- */
function callAPI(action, data = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = 'callback_' + Date.now() + '_' + Math.random().toString(36).substr(2);
    const script = document.createElement('script');
    
    window[callbackName] = function(response) {
      delete window[callbackName];
      document.body.removeChild(script);
      resolve(response);
    };
    
    let url = API_URL + '?action=' + encodeURIComponent(action);
    url += '&callback=' + callbackName;
    
    if (Object.keys(data).length > 0) {
      url += '&payload=' + encodeURIComponent(JSON.stringify(data));
    }
    
    url += '&_=' + Date.now(); // Prevent caching
    
    script.src = url;
    script.onerror = () => {
      delete window[callbackName];
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      reject(new Error('Request failed'));
    };
    
    // Add timeout
    setTimeout(() => {
      if (script.parentNode) {
        delete window[callbackName];
        document.body.removeChild(script);
        reject(new Error('Timeout'));
      }
    }, 15000);
    
    document.body.appendChild(script);
  });
}

/* ---------- Load Data ---------- */
async function loadRemoteData() {
  updateNetworkUI();
  
  // Try to load from API if online
  if (navigator.onLine) {
    try {
      console.log('Loading data from API...');
      const errorsResult = await callAPI('getErrors');
      const occResult = await callAPI('getOccurrences');
      
      // Process errors
      if (errorsResult.errors && Array.isArray(errorsResult.errors)) {
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
      
      // Process occurrences
      if (occResult.occurrences && Array.isArray(occResult.occurrences)) {
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
      
    } catch (err) {
      console.warn('Failed to load from API, using local data:', err);
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
  html += `<div class="info-section"><h3>Continue</h3><p>${escapeHtml(e['continue'] || '')}</p></div>`;
  html += `<div class="info-section"><h3>Solution</h3><p>${escapeHtml(e.solution)}</p></div>`;

  const occs = occurrencesCache.filter(o => padKey(o.error_number) === key);
  html += `<div style="margin-top:12px"><h3>Occurrences (${occs.length})</h3></div>`;
  
  if (occs.length > 0) {
    html += '<div class="accordion">';
    occs.slice().reverse().forEach((occ, idx) => {
      const id = occ.occurrenceId || 'occ_' + idx;
      html += `<div class="accordion-item">
        <button class="accordion-header">${occ.date} — ${occ.technician} <span>▼</span></button>
        <div class="accordion-body" style="display:none">
          <p><strong>Customer:</strong> ${occ.customerName}</p>
          <p><strong>Model:</strong> ${occ.machineModel}</p>
          <p><strong>Serial:</strong> ${occ.machineSerial}</p>
          <p><strong>Remedy:</strong> ${occ.remedy}</p>
          <p><strong>Downtime:</strong> ${occ.downtime}</p>
          <p><strong>Parts:</strong> ${occ.parts}</p>
          ${occ.imageUrl ? `<p><strong>Image:</strong><br><img src="${occ.imageUrl}" style="max-width:300px"></p>` : ''}
          <button class="btn-delete-occ" data-id="${id}" style="margin-top:10px">Delete</button>
        </div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<p>No occurrences recorded for this error.</p>';
  }
  
  html += '</div>';
  resultDiv.innerHTML = html;
  
  // Attach accordion handlers
  document.querySelectorAll('.accordion-header').forEach(btn => {
    btn.onclick = function() {
      const body = this.nextElementSibling;
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    };
  });
  
  // Attach delete handlers
  document.querySelectorAll('.btn-delete-occ').forEach(btn => {
    btn.onclick = async function() {
      const id = this.getAttribute('data-id');
      if (confirm('Delete this occurrence?')) {
        await deleteOccurrence(id);
      }
    };
  });
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
    const id = occ.occurrenceId || 'occ_' + idx;
    html += `<div class="accordion-item">
      <button class="accordion-header">${occ.date} — ${occ.technician} <span>▼</span></button>
      <div class="accordion-body" style="display:none">
        <p><strong>Error Code:</strong> ${occ.error_number}</p>
        <p><strong>Customer:</strong> ${occ.customerName}</p>
        <p><strong>Model:</strong> ${occ.machineModel}</p>
        <p><strong>Serial:</strong> ${occ.machineSerial}</p>
        <p><strong>Remedy:</strong> ${occ.remedy}</p>
        <p><strong>Downtime:</strong> ${occ.downtime}</p>
        <p><strong>Parts:</strong> ${occ.parts}</p>
        ${occ.imageUrl ? `<p><strong>Image:</strong><br><img src="${occ.imageUrl}" style="max-width:300px"></p>` : ''}
        <button class="btn-delete-occ" data-id="${id}" style="margin-top:10px">Delete</button>
      </div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
  
  // Attach handlers
  document.querySelectorAll('.accordion-header').forEach(btn => {
    btn.onclick = function() {
      const body = this.nextElementSibling;
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    };
  });
  
  document.querySelectorAll('.btn-delete-occ').forEach(btn => {
    btn.onclick = async function() {
      const id = this.getAttribute('data-id');
      if (confirm('Delete this occurrence?')) {
        await deleteOccurrence(id);
      }
    };
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---------- Save Functions ---------- */
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
      const result = await callAPI('addError', errorData);
      if (result.status === 'ok') {
        // Update local database
        const key = padKey(code);
        errorDatabase[key] = errorData;
        saveLocalDB();
        populateOccurrenceDropdown();
        toggleForm('errorForm', false);
        
        // Clear form
        ['newErrorCode', 'newMessage', 'newCancel', 'newDetection', 'newContinue', 'newSolution']
          .forEach(id => { if (qs(id)) qs(id).value = ''; });
        
        alert('Error saved successfully!');
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
  alert('Saved locally (offline).');
}

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
        occurrenceData.imageMime = fileInput.files[0].type;
      };
      reader.readAsDataURL(fileInput.files[0]);
    } catch (err) {
      console.warn('Image processing failed:', err);
    }
  }
  
  try {
    if (navigator.onLine) {
      const result = await callAPI('addOccurrence', occurrenceData);
      if (result.status === 'ok') {
        occurrencesCache.push({
          ...occurrenceData,
          imageUrl: result.imageUrl || ''
        });
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
  alert('Saved locally (offline).');
  renderRecentOccurrencesPanel();
}

async function deleteOccurrence(id) {
  try {
    if (navigator.onLine) {
      const result = await callAPI('deleteOccurrence', { occurrenceId: id });
      if (result.status === 'ok') {
        // Update local cache
        occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== id);
        saveLocalOcc();
        alert('Occurrence deleted!');
        searchError();
        renderRecentOccurrencesPanel();
        return;
      }
    }
  } catch (err) {
    console.warn('Online delete failed:', err);
  }
  
  // Offline delete
  occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== id);
  saveLocalOcc();
  alert('Deleted locally (offline).');
  searchError();
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
    btn.onclick = () => toggleForm(btn.getAttribute('data-target'));
  });
  
  // Cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.onclick = () => toggleForm(btn.getAttribute('data-target'), false);
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
}

/* ---------- Password System ---------- */
function checkPassword() {
  const password = qs('passwordInput').value;
  if (password === CORRECT_PASSWORD) {
    qs('passwordOverlay').style.display = 'none';
    qs('mainContainer').style.display = 'block';
    loadRemoteData();
  } else {
    alert('Incorrect password');
  }
}

/* ---------- Initialize ---------- */
document.addEventListener('DOMContentLoaded', function() {
  console.log('PCAM Troubleshooter loaded');
  
  // Setup password button
  const accessBtn = qs('btnAccess');
  if (accessBtn) {
    accessBtn.onclick = checkPassword;
  }
  
  // Setup password field Enter key
  const passwordInput = qs('passwordInput');
  if (passwordInput) {
    passwordInput.onkeypress = (e) => {
      if (e.key === 'Enter') checkPassword();
    };
  }
  
  // Setup network monitoring
  updateNetworkUI();
  window.addEventListener('online', updateNetworkUI);
  window.addEventListener('offline', updateNetworkUI);
  
  // Set today's date in occurrence form
  if (qs('occurrenceDate')) {
    qs('occurrenceDate').value = new Date().toISOString().slice(0, 10);
  }
});

// Global helper for debugging
window.pcamDebug = {
  errorDatabase: () => errorDatabase,
  occurrencesCache: () => occurrencesCache,
  callAPI: callAPI
};
