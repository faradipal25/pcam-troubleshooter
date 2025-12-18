/* script.js — PCAM Troubleshooter (LOCAL SAVE, GET ONLY) */

console.log("SCRIPT LOADED: OK");

const API_URL = "https://script.google.com/macros/s/AKfycbxAE_asBdIOT6NhGe6bk-bP0eFeUSe2HjKQLkyh1ET7XdbcNtpBtJ8cDbaL_BDQPjsM/exec";
const PASSWORD = "SIKIPAL@dip";
const OCC_KEY = "pcam_occurrences_v2";
const $ = id => document.getElementById(id);
const dbg = msg => {
  const box = $("debug");
  if (box) box.textContent = new Date().toISOString() + " — " + msg + "\n" + box.textContent;
  console.log(msg);
};

let errorDatabase = {};
let occurrences = [];
try {
  occurrences = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");
  if (!Array.isArray(occurrences)) occurrences = [];
} catch (e) {
  occurrences = [];
}



/* ---------- helpers ---------- */
function padKey(k){
  return String(k||"").replace(/^E/i,"").padStart(3,"0");
}

/* ---------- GET ---------- */
async function apiGet(url){
  dbg("GET " + url);
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error(res.status);
    return await res.json();
  }catch(e){
    dbg("GET failed: " + e);
    return null;
  }
}

/* ---------- LOAD ERRORS ---------- */
async function fetchErrors(){
  const list = await apiGet(API_URL + "?action=getErrors");
  if(!Array.isArray(list)) return;

  errorDatabase = {};
  list.forEach(r=>{
    const k = padKey(r.error_number ?? r.Error_Number ?? "");
    if(k) errorDatabase[k] = r.message ?? r.Message ?? "";
  });

  populateErrorDropdown();
  dbg("Errors cached: " + Object.keys(errorDatabase).length);
}

/* ---------- LOAD OCCURRENCES ---------- */
function loadOccurrencesLocal(){
  try{
    const raw = localStorage.getItem(OCC_KEY);
    occurrences = raw ? JSON.parse(raw) : [];
    dbg("Loaded local occurrences: " + occurrences.length);
  }catch(e){
    occurrences = [];
    dbg("Failed to load local occurrences");
  }
}
/* ---------- SAVE OCCURRENCE (LOCAL ONLY) ---------- */
function saveOccurrenceLocal(){
  const occ = {
    occurrenceId: "occ_" + Date.now(),
    error_number: padKey($("occCode").value),
    date: $("occDate").value || new Date().toISOString().slice(0,10),
    customerName: $("occCustomer").value,
    engineer: $("occEngineer").value,
    machineModel: $("occModel").value,
    machineSerial: $("occSerial").value,
    remedy: $("occRemedy").value,
    imageUrl: $("occImageUrl").value
  };

  occurrences.push(occ);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));

  alert("Saved ✔");
  searchAndRender();
}

function deleteOccurrence(id){
  const pwd = prompt("Enter password to delete this occurrence:");

  if (pwd === null) return; // user cancelled

  if (pwd !== PASSWORD) {
    alert("Incorrect password. Delete blocked.");
    return;
  }

  const ok = confirm("Are you sure you want to permanently delete this occurrence?");
  if (!ok) return;

  occurrences = occurrences.filter(o => o.occurrenceId !== id);

  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));

  dbg("Deleted occurrence (password verified): " + id);
  searchAndRender();
}


/* ---------- UI ----------- */
function populateErrorDropdown(){
  const dd = $("occCode");
  if(!dd) return;
  dd.innerHTML = '<option value="">-- select --</option>';
  Object.keys(errorDatabase).sort().forEach(k=>{
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k + " — " + errorDatabase[k];
    dd.appendChild(o);
  });
}

function searchAndRender(){
  const raw = $("errorCode").value.trim();
  if(!raw){
    $("searchResult").innerHTML = "";
    return;
  }

  const key = padKey(raw);
  const err = errorDatabase[key];

  if(!err){
    $("searchResult").innerHTML =
      `<div class="card" style="border-left:6px solid #c62828">
        <h3 style="color:#c62828">Error ${key} not found</h3>
      </div>`;
    return;
  }

  const occs = occurrences.filter(o => o.error_number === key);

  let html = `
  <div class="card">
    <h2 style="color:#0b1c2d">
      Error ${key}
    </h2>

    <p style="margin-top:6px;font-size:15px">
      <b>Message:</b> ${err.message || ""}
    </p>

    <p><b>Cancel:</b> ${err.cancel || "-"}</p>
    <p><b>Detection:</b> ${err.detection || "-"}</p>
    <p><b>Continue:</b> ${err.continue || "-"}</p>
    <div style="
      margin-top:10px;
      padding:10px 12px;
      background:#fff3b0;   /* lemon yellow */
      border-left:6px solid #f5c400;
      border-radius:6px;
    ">
      <b>Solution:</b><br>
      ${err.solution || "-"}
    </div>


    <hr>

    <h3>Occurrences (${occs.length})</h3>
  `;

  if(!occs.length){
    html += `<p style="color:#666">No occurrences recorded</p>`;
  } else {
    occs.slice().reverse().forEach(o=>{
      html += `
<div class="occ-card">
  <div class="occ-details">
    <div><b>Date:</b> ${escapeHtml(o.date || "")}</div>
    <div><b>Customer:</b> ${escapeHtml(o.customerName || "")}</div>
    <div><b>Engineer:</b> ${escapeHtml(o.technician || "")}</div>
    <div><b>Model:</b> ${escapeHtml(o.machineModel || "")}</div>
    <div><b>Serial:</b> ${escapeHtml(o.machineSerial || "")}</div>
  </div>

  <div class="solution-highlight">
    ${escapeHtml(o.remedy || "")}
  </div>
</div>
`;

          ${o.imageUrl
          ? `<div style="margin-top:8px">
               <a href="${o.imageUrl}" target="_blank">📷 View Image</a>
             </div>`
          : ""
        }
      </div>
      `;
    });
  }

  html += `</div>`;
  $("searchResult").innerHTML = html;
}




/* ---------- EXPORT OCCURRENCES ---------- */
function exportOccurrences(){
  let data;
  try {
    data = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");
  } catch {
    alert("Export failed: corrupted local data");
    return;
  }

  if (!Array.isArray(data) || !data.length) {
    alert("No occurrences to export");
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    total: data.length,
    occurrences: data
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pcam_occurrences_export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  dbg("Exported " + data.length + " occurrences ✔");
}

/* ---------- IMPORT OCCURRENCES ---------- */
function importOccurrences(){
  const input = $("importFile");
  if (!input || !input.files.length) {
    alert("Select a JSON file first");
    return;
  }

  const file = input.files[0];
  if (!file.name.toLowerCase().endsWith(".json")) {
    alert("Please select a .json file");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);

      let imported = [];
      if (Array.isArray(parsed)) {
        imported = parsed;
      } else if (parsed && Array.isArray(parsed.occurrences)) {
        imported = parsed.occurrences;
      } else {
        alert("Invalid JSON format");
        return;
      }

      const existing = JSON.parse(
        localStorage.getItem(OCC_KEY) || "[]"
      );

      const merged = dedupeOccurrences([...existing, ...imported]);
      localStorage.setItem(OCC_KEY, JSON.stringify(merged));
      occurrences = merged;

      alert("Imported " + imported.length + " occurrences ✔");
      dbg("Imported " + imported.length + " occurrences");

      searchAndRender();
    } catch (e) {
      alert("Invalid JSON file");
      console.error(e);
    }
  };

  reader.readAsText(file);
}

function dedupeOccurrences(list){
  const map = {};
  list.forEach(o => {
    if(o && o.occurrenceId){
      map[o.occurrenceId] = o;
    }
  });
  return Object.values(map);
}


function exportOccurrencesExcel(){
  const data = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");

  if (!Array.isArray(data) || !data.length){
    alert("No occurrences to export");
    return;
  }

  // Convert objects → table
  const headers = Object.keys(data[0]);
  const rows = data.map(o => headers.map(h => o[h] ?? ""));

  let csv = headers.join(",") + "\n";
  rows.forEach(r=>{
    csv += r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "pcam_occurrences.csv";
  a.click();

  URL.revokeObjectURL(url);

  dbg("Excel exported ✔ (" + data.length + " rows)");
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  dbg("SCRIPT ready");

  loadOccurrencesLocal();

  // EXPORT
  const btnExport = $("btnExportOcc");
  if (btnExport) btnExport.onclick = exportOccurrences;

  // IMPORT
  const btnImport = $("btnImportOcc");
  const importFile = $("importFile");

  if (btnImport && importFile) {
    btnImport.onclick = () => importFile.click();
    importFile.onchange = importOccurrences;
    dbg("Import button wired ✔");
  }

  // PASSWORD
  $("btnEnter").onclick = () => {
  if ($("passwordInput").value === PASSWORD) {

    // hide login
    $("passwordCard").classList.add("hidden");

    // show full app
    $("appContainer").classList.remove("hidden");

    // safety: ensure main card visible
    $("mainCard").classList.remove("hidden");

    fetchErrors();
    searchAndRender();

    dbg("Login successful — app unlocked");
  } else {
    alert("Wrong password");
    $("passwordInput").value = "";
  }
};


  // SEARCH
  $("btnSearch").onclick = searchAndRender;

  // SAVE LOCAL
  $("btnSaveOcc").onclick = saveOccurrenceLocal;
});

