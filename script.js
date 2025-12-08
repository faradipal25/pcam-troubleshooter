/* script.js — PCAM Troubleshooter (REST mode via fetch)
   Replace your existing script.js with this file (or paste into your page).
   Make sure your index.html calls this script (or include it inline before </body>).
*/

console.log("SCRIPT LOADED: OK");

const API_URL = "https://script.google.com/macros/s/AKfycbw_VVf-TQ1ShPPiDP3VdYEAlVTfcvqenmXk4GbBIEodvn5dTKuB-PvSMZ6LOSf0Tn9i/exec";

const PASSWORD = "SIKIPAL@dip";
const LOCAL_ERRORS_KEY = "pcam_errors_v1";
const LOCAL_OCC_KEY = "pcam_occs_v1";
const PENDING_KEY = "pcam_pending_v1";

const $ = id => document.getElementById(id);
const dbg = msg => {
  const box = $("debug");
  if (box) box.textContent = new Date().toISOString() + " — " + msg + "\n" + box.textContent;
  console.log(msg);
};

let errorDatabase = {};
let occurrences = [];

/* ---------- helpers ---------- */
function padKey(k){ return String(k||'').replace(/^E/i,'').padStart(3,'0'); }
function saveLocalErrors(){ try{ localStorage.setItem(LOCAL_ERRORS_KEY, JSON.stringify(errorDatabase)); }catch(e){} }
function saveLocalOcc(){ try{ localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrences)); }catch(e){} }
function loadLocalErrors(){ try{ return JSON.parse(localStorage.getItem(LOCAL_ERRORS_KEY)||'{}'); }catch(e){ return {}; } }
function loadLocalOcc(){ try{ return JSON.parse(localStorage.getItem(LOCAL_OCC_KEY)||'[]'); }catch(e){ return []; } }
function loadPending(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); }catch(e){ return []; } }
function savePending(p){ try{ localStorage.setItem(PENDING_KEY, JSON.stringify(p||[])); }catch(e){} }

/* ---------- network helpers ---------- */
async function apiGet(action){
  const url = API_URL + "?action=" + encodeURIComponent(action);
  dbg("GET " + url);
  try{
    const res = await fetch(url, { method: "GET", credentials: "omit" }); // exec endpoints are public
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data;
  } catch(err){
    dbg("apiGet failed: " + err);
    return null;
  }
}

async function apiPost(body){
  dbg("POST " + API_URL + " -> " + JSON.stringify(Object.keys(body)));
  try{
    const res = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data;
  } catch(err){
    dbg("apiPost failed: " + err);
    return null;
  }
}

/* ---------- fetch & populate ---------- */
async function fetchErrors(){
  dbg("Fetching errors from server...");
  const list = await apiGet("getErrors");
  if(Array.isArray(list)){
    errorDatabase = {};
    list.forEach(r=>{
      const key = padKey(r.error_number ?? r.Error_Number ?? r.NO ?? "");
      if(!key) return;
      errorDatabase[key] = {
        error_number: key,
        message: r.message ?? r.Message ?? ""
      };
    });
    saveLocalErrors();
    dbg("Errors cached: " + Object.keys(errorDatabase).length);
    populateErrorDropdown();
    return true;
  } else {
    dbg("Fetch errors failed; using local cache");
    errorDatabase = loadLocalErrors();
    populateErrorDropdown();
    return false;
  }
}

async function fetchOccurrences(){
  dbg("Fetching occurrences from server...");
  const list = await apiGet("getOccurrences");
  if(Array.isArray(list)){
    occurrences = list.map(r=>({
      occurrenceId: r.occurrenceId || ('occ_' + Date.now() + '_' + Math.floor(Math.random()*9000)),
      error_number: padKey(r.error_number ?? r.Error_Number ?? ''),
      date: r.date ?? r.Date ?? '',
      customerName: r.customerName ?? r.customer ?? '',
      machineModel: r.machineModel ?? r.machineModel ?? '',
      machineSerial: r.machineSerial ?? r.machineSerial ?? '',
      remedy: r.remedy ?? r.remedyApplied ?? '',
      technician: r.technician ?? r.Technician ?? '',
      downtime: r.downtime ?? r.Downtime ?? '',
      parts: r.parts ?? r.Parts ?? '',
      imageUrl: r.imageUrl ?? ''
    }));
    saveLocalOcc();
    dbg("Occurrences cached: " + occurrences.length);
    return true;
  } else {
    dbg("Fetch occurrences failed; using local cache");
    occurrences = loadLocalOcc();
    dbg("Local occurrences: " + occurrences.length);
    return false;
  }
}

function populateErrorDropdown(){
  const dd = $("occCode");
  if(!dd) return;
  dd.innerHTML = '<option value="">-- select --</option>';
  Object.keys(errorDatabase).sort((a,b)=>Number(a)-Number(b)).forEach(code=>{
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code + " — " + (errorDatabase[code].message||'');
    dd.appendChild(opt);
  });
}

/* ---------- image helper (resize) ---------- */
function resizeImageFileToDataURL(file, maxWidth=900, quality=0.78){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> {
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
/* ---------- Save Occurrence ---------- */
async function saveOccurrence() {

  const code = $("occCode").value;
  if (!code) return alert("Select an error code");

  // Build occurrence object
  const occ = {
    occurrenceId: "occ_" + Date.now() + "_" + Math.floor(Math.random()*9000),
    error_number: padKey(code),
    date: $("occDate").value || new Date().toISOString().slice(0,10),
    customerName: $("occCustomer").value.trim(),
    machineModel: $("occModel") ? $("occModel").value.trim() : "",
    machineSerial: $("occSerial") ? $("occSerial").value.trim() : "",
    remedy: $("occRemedy").value.trim(),
    technician: $("occTech") ? $("occTech").value.trim() : "",
    downtime: $("occDown") ? $("occDown").value.trim() : "",
    parts: $("occParts") ? $("occParts").value.trim() : ""
  };

  // Handle image (resize + convert)
  const f = $("occImage") ? $("occImage").files[0] : null;
  if (f) {
    dbg("Resizing image...");
    try {
      const dataUrl = await resizeImageFileToDataURL(f, 900, 0.78);
      const parts = dataUrl.split(",");
      if (parts.length === 2) {
        occ.imageBase64 = parts[1];
        occ.imageMime = parts[0].match(/data:([^;]+);/)?.[1] || "image/jpeg";
      }
      if ($("imgPreview")) {
        $("imgPreview").src = dataUrl;
        $("imgPreview").classList.remove("hidden");
      }
      dbg("Prepared image (" + occ.imageMime + ") length=" + occ.imageBase64.length);
    } catch (e) {
      dbg("Image processing failed: " + e);
    }
  }

  // Convert occ → base64 payload
  const jsonString = JSON.stringify(occ);
  const b64 = btoa(unescape(encodeURIComponent(jsonString)));

  // Build GET URL
  const url = API_URL + "?action=addOccGET&payload=" + encodeURIComponent(b64);
  dbg("Saving via GET: " + url.substring(0,120) + "...");

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    dbg("Server returned: " + JSON.stringify(data));

    if (data.status === "ok") {
      occ.imageUrl = data.imageUrl || "";
      occurrences.push(occ);
      saveLocalOcc();
      alert("Saved online (CORS-free)");
      await fetchOccurrences();  // refresh list
    } else {
      alert("Server error: " + JSON.stringify(data));
    }
  } catch (err) {
    dbg("Save failed, queuing locally: " + err);
    queueOccurrenceLocally(occ);
    alert("Network error – queued locally");
  }
}
function queueOccurrenceLocally(occ){
  const pending = loadPending();
  pending.push(occ);
  savePending(pending);
  occurrences.push(occ);
  saveLocalOcc();
  dbg("Occurrence queued locally; pending count: " + pending.length);
}

/* ---------- pending sync ---------- */
async function syncPending(){
  const pending = loadPending();
  if(!pending.length) return;
  if(!navigator.onLine) return;
  dbg("Syncing pending occurrences: " + pending.length);
  const remaining = [];
  for(const item of pending){
    const payload = { action: "addOccurrence", ...item };
    const res = await apiPost(payload);
    if(res && (res.status === "ok" || res.imageUrl !== undefined)) {
      dbg("Pending item synced (imageUrl: " + (res.imageUrl||'') + ")");
    } else {
      remaining.push(item);
    }
  }
  savePending(remaining);
  await fetchOccurrences();
}

/* ---------- search & render ---------- */
function searchAndRender(){
  const raw = $("errorCode") ? $("errorCode").value.trim() : '';
  if(!raw){ $("searchResult").innerHTML = "<div style='color:#666'>Enter an error code</div>"; return; }
  const key = padKey(raw);
  const e = errorDatabase[key];
  if(!e){ $("searchResult").innerHTML = "<div style='color:#a00'>Code not found</div>"; return; }
  const occs = occurrences.filter(o => padKey(o.error_number) === key);
  let html = `<h3>${key}</h3><p>${escapeHtml(e.message)}</p><h4>Occurrences (${occs.length})</h4>`;
  if(!occs.length) html += "<div style='color:#666'>No occurrences</div>";
  else {
    occs.slice().reverse().forEach(o=>{
      html += `<div style="padding:8px;border:1px solid #eee;margin:8px 0;border-radius:6px">
                 <div><strong>${escapeHtml(o.date||'')}</strong> — ${escapeHtml(o.technician||'')}</div>
                 <div>${escapeHtml(o.customerName||'')} (${escapeHtml(o.machineModel||'')})</div>
                 <div>${escapeHtml(o.remedy||'')}</div>`;
      if(o.imageUrl) html += `<div><a target="_blank" href="${o.imageUrl}">View image</a></div>`;
      html += `</div>`;
    });
  }
  $("searchResult").innerHTML = html;
}

/* ---------- small helpers ---------- */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

/* ---------- init ---------- */
async function initApp(){
  updateNetUI();
  let ok = false;
  if(navigator.onLine){
    ok = await fetchErrors();
    await fetchOccurrences();
    await syncPending();
  } else {
    errorDatabase = loadLocalErrors();
    occurrences = loadLocalOcc();
  }
  populateErrorDropdown();
}
function updateNetUI(){ const el = $("netStatus"); if(el) el.textContent = navigator.onLine ? "Online" : "Offline"; }
window.addEventListener("online", ()=>{ updateNetUI(); syncPending(); fetchErrors().then(()=>populateErrorDropdown()); });
window.addEventListener("offline", updateNetUI);

/* ---------- wire UI ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  dbg("SCRIPT ready");
  // Password flow
  const btn = $("btnEnter");
  if(btn){
    btn.onclick = ()=>{
      if($("passwordInput").value === PASSWORD){
        $("passwordCard").classList.add("hidden");
        const main = $("mainCard");
        if(main) main.classList.remove("hidden");
        dbg("Password OK — loading data...");
        initApp();
      } else {
        alert("Incorrect password");
        $("passwordInput").value = "";
      }
    };
  }

  // wire controls (if exist)
  if($("btnLoadErrors")) $("btnLoadErrors").onclick = fetchErrors;
  if($("btnLoadOccurrences")) $("btnLoadOccurrences").onclick = fetchOccurrences;
  if($("btnShowCache")) $("btnShowCache").onclick = ()=>{ dbg("Local occs: " + occurrences.length); $("debug").textContent = JSON.stringify(occurrences.slice(-30), null, 2) + "\n" + ($("debug").textContent||''); };
  if($("btnSearch")) $("btnSearch").onclick = searchAndRender;
  if($("btnSaveOcc")) $("btnSaveOcc").onclick = saveOccurrence;

  // small preview for file input
  if($("occImage")){
    $("occImage").addEventListener("change", (ev)=>{
      const f = ev.target.files[0];
      if(!f) { if($("imgPreview")) $("imgPreview").classList.add("hidden"); return; }
      const reader = new FileReader();
      reader.onload = ()=>{ if($("imgPreview")){ $("imgPreview").src = reader.result; $("imgPreview").classList.remove("hidden"); } };
      reader.readAsDataURL(f);
    });
  }

  updateNetUI();
});

/* ---------- expose for console ---------- */
window.__pcam = window.__pcam || {};
window.__pcam.fetchErrors = fetchErrors;
window.__pcam.fetchOccurrences = fetchOccurrences;
window.__pcam.saveOccurrence = saveOccurrence;
window.__pcam.occurrences = occurrences;
window.__pcam.errors = errorDatabase;
