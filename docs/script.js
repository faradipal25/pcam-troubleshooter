/* final script.js with JSONP solution */
const API_URL = "https://script.google.com/macros/s/AKfycby-eZfrE3kElDWg7Z-tAanOLyoRy1B4qAgtYcXWML-PGnZfJ51y9jlAs1mITO2hi8KP/exec";
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

/* ---------- JSONP API Helper ---------- */
function apiJsonp(action, body) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    
    window[callbackName] = function(response) {
      delete window[callbackName];
      document.body.removeChild(script);
      console.log('JSONP response for', action, ':', response);
      resolve(response);
    };
    
    let url = API_URL + "?action=" + encodeURIComponent(action);
    if (body) {
      url += "&payload=" + encodeURIComponent(JSON.stringify(body));
    }
    url += "&callback=" + callbackName;
    url += "&_t=" + Date.now(); // Cache buster
    
    console.log('JSONP request URL:', url);
    
    script.src = url;
    script.onerror = () => {
      delete window[callbackName];
      document.body.removeChild(script);
      console.error('JSONP request failed for', action);
      reject(new Error('JSONP request failed'));
    };
    
    document.body.appendChild(script);
  });
}

/* ---------- Fetch Errors ---------- */
async function fetchErrorsFromApi(){
  try {
    const json = await apiJsonp('getErrors');
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
    const json = await apiJsonp('getOccurrences');
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
      const res = await apiJsonp('addError', obj);
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

  // Handle image - store locally, upload separately
  const f = qs('occurrenceImage').files[0];
  if(f){
    try {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const base64 = e.target.result.split(',')[1];
        // Save image data locally
        occ.imageBase64 = base64;
        occ.imageMime = f.type || "image/jpeg";
        
        // Upload image when online
        if(navigator.onLine){
          try {
            const formData = new FormData();
            formData.append('action', 'uploadImage');
            formData.append('mime', occ.imageMime);
            formData.append('file', f);
            
            // Use XMLHttpRequest for image upload (can handle FormData)
            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_URL);
            xhr.onload = function() {
              try {
                const response = JSON.parse(xhr.responseText);
                if(response && response.status === 'ok') {
                  occ.imageUrl = response.imageUrl || '';
                }
              } catch(e) {
                console.warn('Failed to parse image upload response');
              }
            };
            xhr.send(formData);
          } catch(err) {
            console.warn('Image upload failed:', err);
          }
        }
      };
      reader.readAsDataURL(f);
    } catch(err){ 
      console.warn('Image processing failed:', err);
    }
  }

  // Save occurrence
  try {
    if(navigator.onLine){
      const sendObj = {...occ};
      delete sendObj.imageBase64;
      delete sendObj.imageMime;
      
      const res = await apiJsonp('addOccurrence', sendObj);
      
      if(res && res.status === 'ok'){
        // Add to local cache
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
            imageUrl: r.imageUrl || occ.imageUrl || ''
          }));
        } else {
          occ.imageUrl = occ.imageUrl || '';
          occurrencesCache.push(occ);
        }
        
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
    const res = await apiJsonp('deleteOccurrence', { occurrenceId: occid });
    if(res && res.status === 'ok'){
      return res;
    }
    return null;
  } catch(err) {
    console.warn('Delete API call failed:', err);
    return null;
  }
}

/* ---------- Update your delete handler ---------- */
// In your attachAccordionHandlers function, update the delete button handler:
async function handleDeleteOccurrence(occid) {
  if(!confirm('Are you sure you want to delete this occurrence?')) return;
  
  try {
    if(navigator.onLine){
      const res = await deleteOccurrenceFromApi(occid);
      if(res){
        // Update from API response
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
        return true;
      }
    }
  } catch(err) { 
    console.warn('Online delete failed:', err);
  }
  
  // Offline delete
  occurrencesCache = occurrencesCache.filter(o => o.occurrenceId !== occid);
  saveLocalOcc();
  alert('Deleted locally (offline).');
  return false;
}

/* ---------- Load Data ---------- */
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

/* ---------- Keep the rest of your UI functions the same ---------- */
// [Keep all your other functions: populateOccurrenceDropdown, searchError, 
// renderAccordionList, renderRecentOccurrencesPanel, attachAccordionHandlers, 
// toggleForm, exportDB, importDB, checkPassword, etc.]
