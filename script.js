/* script.js — PCAM Troubleshooter(LOCAL SAVE, GET ONLY) */

console.log("SCRIPT LOADED: OK");

const API_URL = "https://script.google.com/macros/s/AKfycbxAE_asBdIOT6NhGe6bk-bP0eFeUSe2HjKQLkyh1ET7XdbcNtpBtJ8cDbaL_BDQPjsM/exec";
const PASSWORD = "SIKIPAL@dip";
const OCC_KEY = "pcam_occurrences_v2";

const $ = id => document.getElementById(id);
const dbg = msg => {
  const box = $("debug");
  if (box) {
    box.textContent =
      new Date().toISOString() + " — " + msg + "\n" + box.textContent;
  }
  console.log(msg);
};

let errorDatabase = {};
let occurrences = [];

/* ---------- LOAD LOCAL DATA ---------- */
function loadOccurrencesLocal() {
  try {
    const raw = localStorage.getItem(OCC_KEY);
    occurrences = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(occurrences)) occurrences = [];
    dbg("Loaded local occurrences: " + occurrences.length);
  } catch (e) {
    occurrences = [];
    dbg("Failed to load local occurrences");
  }
}

/* ---------- HELPERS ---------- */
function padKey(k) {
  return String(k || "").replace(/^E/i, "").padStart(3, "0");
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------- GET ---------- */
async function apiGet(url) {
  dbg("GET " + url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    dbg("GET failed: " + e);
    return null;
  }
}

/* ---------- LOAD ERRORS ---------- */
async function fetchErrors() {
  const list = await apiGet(API_URL + "?action=getErrors");
  if (!Array.isArray(list)) return;

  errorDatabase = {};
  list.forEach(r => {
    const k = padKey(r.error_number ?? r.Error_Number ?? "");
    if (k) {
      errorDatabase[k] = {
        message: r.message ?? r.Message ?? "",
        cancel: r.cancel ?? "",
        detection: r.detection ?? "",
        continue: r.continue ?? "",
        solution: r.solution ?? ""
      };
    }
  });

  populateErrorDropdown();
  dbg("Errors cached: " + Object.keys(errorDatabase).length);
}

/* ---------- SAVE OCCURRENCE ---------- */
function saveOccurrenceLocal() {
  const code = $("occCode")?.value;
  if (!code) {
    alert("Select error code");
    return;
  }

  const occ = {
    occurrenceId: "occ_" + Date.now(),
    error_number: padKey(code),
    date: $("occDate")?.value || new Date().toISOString().slice(0, 10),
    customerName: $("occCustomer")?.value || "",
    engineer: $("occEngineer")?.value || "",
    machineModel: $("occModel")?.value || "",
    machineSerial: $("occSerial")?.value || "",
    remedy: $("occRemedy")?.value || "",
    imageUrl: $("occImageUrl")?.value || ""
  };

  occurrences.push(occ);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));

  alert("Saved ✔");
  searchAndRender();
}

/* ---------- DELETE OCCURRENCE (LOCKED) ---------- */
function deleteOccurrence(id) {
  const pwd = prompt("Enter password to delete:");
  if (pwd !== PASSWORD) {
    alert("Delete blocked");
    return;
  }

  if (!confirm("Permanently delete this occurrence?")) return;

  occurrences = occurrences.filter(o => o.occurrenceId !== id);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));
  dbg("Deleted occurrence: " + id);
  searchAndRender();
}

/* ---------- UI ---------- */
function populateErrorDropdown() {
  const dd = $("occCode");
  if (!dd) return;
  dd.innerHTML = '<option value="">-- select --</option>';

  Object.keys(errorDatabase)
    .sort()
    .forEach(k => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k + " — " + errorDatabase[k].message;
      dd.appendChild(o);
    });
}

/* ---------- SEARCH & RENDER ---------- */
function searchAndRender(){
  const raw = $("errorCode").value.trim();
  if(!raw){
    $("searchResult").innerHTML = "";
    return;
  }

  const key = padKey(raw);
  const err = errorDatabase[key];

  if(!err){
    $("searchResult").innerHTML = `
      <div class="card" style="border-left:6px solid #c62828">
        <h3 style="color:#c62828">Error ${key} not found</h3>
      </div>`;
    return;
  }

  const occs = occurrences.filter(o => o.error_number === key);

  let html = `
  <div class="card">
    <h2 style="color:#c62828">Error ${key}</h2>
    <div style="margin-bottom:8px;color:#c62828">
      <b>Error Message:</b><br>
      ${escapeHtml(err.message || "-")}
    </div>
    <div style="margin-top:10px">
      <p><b>Cancel:</b><br>${escapeHtml(err.cancel || "-")}</p>
      <p><b>Detection:</b><br>${escapeHtml(err.detection || "-")}</p>
      <p><b>Continue:</b><br>${escapeHtml(err.continue || "-")}</p>
    </div>

    <div style="
      margin-top:12px;
      padding:12px;
      background:#fff9c4;   /* lemon highlight */
      border-left:6px solid #f5c400;
      border-radius:8px;
    ">
      <b>Solution:</b><br>
      ${escapeHtml(err.solution || "-")}
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
        
          <div class="occ-meta">
            <div><b>Date:</b> ${escapeHtml(o.date || "")}</div>
            <div><b>Customer:</b> ${escapeHtml(o.customerName || "")}</div>
            <div><b>Engineer:</b> ${escapeHtml(o.engineer || "")}</div>
            <div><b>Model:</b> ${escapeHtml(o.machineModel || "")}</div>
            <div><b>Serial:</b> ${escapeHtml(o.machineSerial || "")}</div>
          </div>

        <div class="solution-highlight">
          ${escapeHtml(o.remedy || "")}
        </div>
      
        ${
          o.imageUrl
            ? `<div style="margin-top:8px">
                 <a target="_blank" href="${o.imageUrl}">📷 View Image</a>
               </div>`
            : ""
        }
      
        <div class="occ-actions">
          <button onclick="deleteOccurrence('${o.occurrenceId}')">
            🗑 Delete
          </button>
        </div>
      
      </div>`;

    });
  }

  html += `</div>`;
  $("searchResult").innerHTML = html;
}

/* ---------- EXPORT ---------- */
function exportOccurrences() {
  const data = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");
  if (!data.length) {
    alert("No data");
    return;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pcam_occurrences.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  dbg("SCRIPT ready");
  loadOccurrencesLocal();

  $("btnEnter").onclick = () => {
    if ($("passwordInput").value === PASSWORD) {
      $("passwordCard").classList.add("hidden");
      $("appContainer").classList.remove("hidden");
      $("mainCard").classList.remove("hidden");

      fetchErrors();
      searchAndRender();
    } else {
      alert("Wrong password");
    }
  };

  $("btnSearch").onclick = searchAndRender;
  $("btnSaveOcc").onclick = saveOccurrenceLocal;
  $("btnExportOcc").onclick = exportOccurrences;
});
