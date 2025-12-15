/* script.js — PCAM Troubleshooter (LOCAL SAVE, GET ONLY) */

console.log("SCRIPT LOADED: OK");

const API_URL = "https://script.google.com/macros/s/AKfycbxAE_asBdIOT6NhGe6bk-bP0eFeUSe2HjKQLkyh1ET7XdbcNtpBtJ8cDbaL_BDQPjsM/exec";
const PASSWORD = "SIKIPAL@dip";
const LOCAL_OCC_KEY = "pcam_occurrences_v1";

const $ = id => document.getElementById(id);
const dbg = msg => {
  const box = $("debug");
  if (box) box.textContent = new Date().toISOString() + " — " + msg + "\n" + box.textContent;
  console.log(msg);
};

let errorDatabase = {};
let occurrences = [];

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
function loadLocalOccurrences(){
  try{
    const data = JSON.parse(localStorage.getItem(LOCAL_OCC_KEY) || "[]");
    if(Array.isArray(data)){
      occurrences = data;
      dbg("Loaded local occurrences: " + occurrences.length);
    }
  }catch(e){
    dbg("No local occurrences");
  }
}

/* ---------- SAVE OCCURRENCE (LOCAL ONLY) ---------- */
function saveOccurrence(){
  const code = $("occCode")?.value;
  if(!code) return alert("Select error code");

  const occ = {
    id: "occ_" + Date.now(),
    error_number: padKey(code),
    date: $("occDate")?.value || new Date().toISOString().slice(0,10),
    customerName: $("occCustomer")?.value || "",
    remedy: $("occRemedy")?.value || "",
    imageUrl: $("occImageUrl")?.value || ""
  };

  occurrences.push(occ);
  localStorage.setItem(LOCAL_OCC_KEY, JSON.stringify(occurrences));

  alert("Saved locally ✔");
  dbg("Saved occurrence: " + JSON.stringify(occ));

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
  occs.forEach(o=>{
    html += `<div>
      ${o.date} — ${o.customerName}<br>
      ${o.remedy}<br>
      ${o.imageUrl ? `<a target="_blank" href="${o.imageUrl}">Image</a>` : ""}
    </div><hr>`;
  });

  $("searchResult").innerHTML = html;
}
function exportOccurrences(){
  const data = localStorage.getItem("pcam_local_occurrences");
  if(!data){
    alert("No local occurrences to export");
    return;
  }

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "pcam_occurrences_backup.json";
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM LOADED");
  dbg("SCRIPT ready");

  // Load locally saved occurrences (for offline / persistence)
  loadLocalOccurrences();

  /* ---- EXPORT BUTTON ---- */
  const expBtn = document.getElementById("btnExportOcc");
  if (expBtn) {
    expBtn.addEventListener("click", exportOccurrences);
    console.log("Export button wired ✔");
  } else {
    console.log("Export button NOT FOUND ❌");
  }

  /* ---- PASSWORD FLOW ---- */
  const btnEnter = $("btnEnter");
  if (btnEnter) {
    btnEnter.onclick = () => {
      if ($("passwordInput").value === PASSWORD) {
        $("passwordCard").classList.add("hidden");
        $("mainCard").classList.remove("hidden");

        // Load master data
        fetchErrors();
        searchAndRender();

        console.log("Password accepted ✔");
      } else {
        alert("Wrong password");
      }
    };
  }

  /* ---- SEARCH ---- */
  const btnSearch = $("btnSearch");
  if (btnSearch) {
    btnSearch.onclick = searchAndRender;
  }

  /* ---- SAVE OCCURRENCE ---- */
  const btnSave = $("btnSaveOcc");
  if (btnSave) {
    btnSave.onclick = saveOccurrence;
  }
});
