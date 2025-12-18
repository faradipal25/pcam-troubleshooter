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
  const code = $("occCode")?.value;
  if(!code){
    alert("Select an error code");
    return;
  }

  const occ = {
    occurrenceId: "occ_" + Date.now(),
    error_number: padKey(code),
    date: $("occDate")?.value || new Date().toISOString().slice(0,10),
    customerName: $("occCustomer")?.value || "",
    remedy: $("occRemedy")?.value || "",
    imageUrl: $("occImageUrl")?.value || ""
  };

  occurrences = dedupeOccurrences([...occurrences, occ]);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));

  dbg("Saved locally ✔");
  alert("Saved ✔");

  searchAndRender();
}
function deleteOccurrence(id){
  if (!confirm("Delete this occurrence?")) return;

  occurrences = occurrences.filter(o => o.occurrenceId !== id);

  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));

  dbg("Deleted occurrence: " + id);
  searchAndRender();
}

/* ---------- UI ---------- */
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
  const key = padKey($("errorCode")?.value || "");
  const occs = occurrences.filter(o => o.error_number === key);

  let html = `<h3>${key}</h3><h4>Occurrences (${occs.length})</h4>`;

  if (!occs.length) {
    html += `<div>No occurrences found</div>`;
  }

  occs.forEach(o=>{
    html += `
      <div style="border:1px solid #ddd;padding:8px;margin:8px 0;border-radius:6px">
        <div><b>Date:</b> ${o.date}</div>
        <div><b>Customer:</b> ${o.customerName}</div>
        <div><b>Remedy:</b> ${o.remedy}</div>
        ${o.imageUrl ? `<div><a target="_blank" href="${o.imageUrl}">Image</a></div>` : ""}
        <button 
          style="margin-top:6px;background:#dc3545;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer"
          onclick="deleteOccurrence('${o.occurrenceId}')"
        >
          🗑 Delete
        </button>
      </div>
    `;
  });

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
      $("passwordCard").classList.add("hidden");
      $("mainCard").classList.remove("hidden");
      fetchErrors();
      searchAndRender();
      dbg("Password accepted ✔");
    } else {
      alert("Wrong password");
    }
  };

  // SEARCH
  $("btnSearch").onclick = searchAndRender;

  // SAVE LOCAL
  $("btnSaveOcc").onclick = saveOccurrenceLocal;
});

