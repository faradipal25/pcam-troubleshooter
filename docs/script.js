/* final script.js with improved JSONP handling */
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

/* ---------- Delete Occurrence ---------- */
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

/* ---------- [Keep all other UI functions the same as before] ---------- */
// populateOccurrenceDropdown, escapeHtml, searchError, renderAccordionList,
// renderRecentOccurrencesPanel, attachAccordionHandlers, toggleForm,
// exportDB, importDB, loadRemoteData, attachUIEvents, checkPassword,
// updateNetworkUI, DOMContentLoaded event listener

// ... [Copy all the UI functions from the previous script.js here] ...

/* ---------- Password ---------- */
function checkPassword(){
  const p = qs('passwordInput').value;
  console.log('Password entered:', p);
  if(p === CORRECT_PASSWORD){
    qs('passwordOverlay').style.display = 'none';
    qs('mainContainer').style.display = 'block';
    loadRemoteData();
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
  
  updateNetworkUI();
  window.addEventListener('online', () => { 
    updateNetworkUI(); 
  });
  window.addEventListener('offline', () => { 
    updateNetworkUI(); 
  });
  
  const accessBtn = qs('btnAccess');
  if(accessBtn) {
    console.log('Found access button');
    accessBtn.addEventListener('click', checkPassword);
  }
  
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
  loadRemoteData
};
