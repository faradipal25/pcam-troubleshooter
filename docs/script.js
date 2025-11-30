// CONFIG - replace this with your Apps Script exec URL
const API_URL = "https://script.google.com/macros/s/AKfycby4WZi_8TY9NxiHmVUuJjvoWU-f86TeEQXCFJvL8wqPXlEyJeRWXkV0cM7yTb_RlHgb/exec";

// Password
const CORRECT_PASSWORD = "SIKIPAL@dip";

// Local keys
const LOCAL_DB_KEY = "pcam_error_db_v1";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";
const PENDING_KEY = "pcam_pending_v1";

let errorDatabase = {};
let occurrencesCache = [];

/* Utility */
const $ = id => document.getElementById(id);
function padKey(k){ return String(k).replace(/^E/i,'').padStart(3,'0'); }
function saveLocalDB(){ localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(errorDatabase)); }
function saveLocalOcc(){ localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrencesCache)); }
function loadLocalDB(){ try { return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'{}'); }catch(e){ return {}; } }
function loadLocalOcc(){ try { return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); }catch(e){ return []; } }
function loadPending(){ try { return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); }catch(e){ return []; } }
function savePending(a){ localStorage.setItem(PENDING_KEY, JSON.stringify(a||[])); }

function updateNetworkStatus(){
  const el = $('netStatus');
  if(navigator.onLine){ el.textContent = 'Online'; el.style.color = '#176f3b'; }
  else { el.textContent = 'Offline'; el.style.color = 'red'; }
}

/* API GET/POST */
async function apiGet(action, params){
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  if(params) Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  return await res.json();
}
async function apiPost(action, body){
  const payload = Object.assign({action: action}, body || {});
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  return await res.json();
}

/* Load remote DB */
async function fetchErrorsFromApi(){
  try{
    const json = await apiGet('getErrors');
    const list = json.errors || json || [];
    errorDatabase = {};
    list.forEach(r=>{
      const key = padKey(r.error_number);
      errorDatabase[key] = {
        error_number: key,
        message: r.message || "",
        cancel: r.cancel || "",
        detection: r.detection || "",
        'continue': r['continue'] || "",
        solution: r.solution || ""
      };
    });
    saveLocalDB();
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}
async function fetchOccurrencesFromApi(){
  try{
    const json = await apiGet('getOccurrences');
    const list = json.occurrences || json || [];
    occurrencesCache = list.map(r=>({
      error_number: padKey(r.error_number),
      date: r.date,
      customerName: r.customerName,
      machineModel: r.machineModel,
      machineSerial: r.machineSerial,
      remedy: r.remedy,
      technician: r.technician,
      downtime: r.downtime,
      parts: r.parts,
      imageUrl: r.imageUrl || ""
    }));
    saveLocalOcc();
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}

/* UI Helpers */
function populateOccurrenceDropdown(){
  const dropdown = $('occurrenceErrorCode');
  dropdown.innerHTML = '<option value="">Select Error Code</option>';
  Object.keys(errorDatabase).sort((a,b)=>Number(a)-Number(b)).forEach(code=>{
    let opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    dropdown.appendChild(opt);
  });
}

function escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function searchError(){
  const raw = $('errorCode').value.trim();
  if(!raw){
    $('result').innerHTML = `<div class="not-found"><h3>Please enter an error code</h3></div>`;
    return;
  }
  const key = padKey(raw);
  const e = errorDatabase[key];
  if(!e){
    $('result').innerHTML = `<div class="not-found"><h3>Error Code "${raw}" Not Found</h3></div>`;
    return;
  }

  let html = `<div class="error-info">
      <div class="error-header">
        <h2>Error Code</h2>
        <div class="error-code">${key}</div>
      </div>

      <div class="info-section"><h3>Message</h3><p>${escapeHtml(e.message)}</p></div>
      <div class="info-section"><h3>Cancel</h3><p>${escapeHtml(e.cancel)}</p></div>
      <div class="info-section"><h3>Detection</h3><p>${escapeHtml(e.detection)}</p></div>
      <div class="info-section"><h3>Continue</h3><p>${escapeHtml(e['continue'])}</p></div>
      <div class="info-section"><h3>Solution</h3><p>${escapeHtml(e.solution)}</p></div>

      <button class="btn-save" onclick="prefillOccurrence('${key}')">➕ Add Occurrence</button>
    </div>`;

  $('result').innerHTML = html;
}

/* Pre-fill occurrence */
function prefillOccurrence(key){
  $('occurrenceErrorCode').value = key;
  $('occurrenceDate').valueAsDate = new Date();
  toggleAddForm('occurrenceForm');
}

/* Save new occurrence */
async function saveNewOccurrence(){
  const code = $('occurrenceErrorCode').value;
  if(!code){ alert('Select error code'); return; }

  const occ = {
    error_number: padKey(code),
    date: $('occurrenceDate').value,
    customerName: $('customerName').value,
    machineModel: $('machineModel').value,
    machineSerial: $('machineSerial').value,
    remedy: $('occurrenceRemedy').value,
    technician: $('occurrenceTechnician').value,
    downtime: $('occurrenceDowntime').value,
    parts: $('occurrenceParts').value
  };

  const f = $('occurrenceImage').files[0];
  if(f){
    const dataUrl = await fileToBase64(f);
    const parts = dataUrl.split(',');
    occ.imageMime = parts[0].split(':')[1].split(';')[0];
    occ.imageBase64 = parts[1];
  }

  let res = {status:"failed"};
  try{
    res = await apiPost('addOccurrence', occ);
  }catch(e){
    console.error(e);
  }

  if(res.status==="ok"){
    alert("Saved.");
    toggleAddForm('occurrenceForm');
  } else {
    alert("Failed (offline?) Saved locally.");
  }
}

/* Base64 */
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* Add New Error */
async function saveNewError(){
  const raw = $('newErrorCode').value.trim();
  const key = padKey(raw);
  const obj = {
    error_number:key,
    message:$('newMessage').value,
    cancel:$('newCancel').value,
    detection:$('newDetection').value,
    'continue':$('newContinue').value,
    solution:$('newSolution').value
  };
  let res = {};
  try{ res = await apiPost('addError', obj); }catch(e){}

  if(res.status==="ok"){
    alert("Saved.");
  } else {
    alert("Saved locally.");
  }
}

/* Toggle section */
function toggleAddForm(id){
  const el = $(id);
  el.style.display = (el.style.display==="block") ? "none" : "block";
}

/* Initialization */
document.addEventListener("DOMContentLoaded", ()=>{
  $('btnAccess').onclick = ()=>{
    if($('passwordInput').value===CORRECT_PASSWORD){
      $('passwordOverlay').style.display="none";
      $('mainContainer').style.display="block";
      loadRemote();
    } else { alert("Incorrect password"); }
  };

  $('btnSearch').onclick = searchError;
  $('btnSaveOcc').onclick = saveNewOccurrence;
  $('btnSaveError').onclick = saveNewError;

  updateNetworkStatus();
});

/* Load DB */
async function loadRemote(){
  let ok = false;
  if(navigator.onLine){
    ok = await fetchErrorsFromApi();
    if(ok) await fetchOccurrencesFromApi();
  }
  if(!ok){
    errorDatabase = loadLocalDB();
    occurrencesCache = loadLocalOcc();
  }
  populateOccurrenceDropdown();
  updateNetworkStatus();
}
