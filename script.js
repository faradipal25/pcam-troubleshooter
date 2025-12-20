/* script.js — PCAM Troubleshooter (LOCAL SAVE, GET ONLY) */

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
  } catch {
    occurrences = [];
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
  } catch {
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
        message: r.message ?? "",
        cancel: r.cancel ?? "",
        detection: r.detection ?? "",
        continue: r.continue ?? "",
        solution: r.solution ?? ""
      };
    }
  });

  populateErrorDropdown();
}

/* ---------- SAVE OCCURRENCE ---------- */
function saveOccurrenceLocal() {
  const occ = {
    occurrenceId: "occ_" + Date.now(),
    error_number: padKey($("occCode").value),
    date: $("occDate").value || new Date().toISOString().slice(0, 10),
    customerName: $("occCustomer").value || "",
    engineer: $("occEngineer").value || "",
    machineModel: $("occModel").value || "",
    machineSerial: $("occSerial").value || "",
    remedy: $("occRemedy").value || "",
    imageUrl: $("occImageUrl").value || ""
  };

  occurrences.push(occ);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));
  alert("Saved ✔");
  searchAndRender();
}

/* ---------- DELETE ---------- */
function deleteOccurrence(id) {
  const pwd = prompt("Enter password to delete:");
  if (pwd !== PASSWORD) return alert("Delete blocked");
  if (!confirm("Delete permanently?")) return;

  occurrences = occurrences.filter(o => o.occurrenceId !== id);
  localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));
  searchAndRender();
}

/* ---------- UI ---------- */
function populateErrorDropdown() {
  const dd = $("occCode");
  dd.innerHTML = '<option value="">-- select --</option>';
  Object.keys(errorDatabase).sort().forEach(k => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k + " — " + errorDatabase[k].message;
    dd.appendChild(o);
  });
}

/* ---------- SEARCH & RENDER ---------- */
function searchAndRender() {
  const key = padKey($("errorCode").value || "");
  const err = errorDatabase[key];
  if (!err) return;

  const occs = occurrences.filter(o => o.error_number === key);

  let html = `
  <div class="card">
    <h2 style="color:#c62828">Error ${key}</h2>
    <div style="color:#c62828">${escapeHtml(err.message)}</div>

    <div style="background:#fff9c4;padding:10px;margin-top:10px">
      <b>Solution:</b><br>${escapeHtml(err.solution)}
    </div>

    <h3>Occurrences (${occs.length})</h3>
  `;

  occs.reverse().forEach(o => {
    html += `
    <div class="occ-card">
      <div><b>Date:</b> ${o.date}</div>
      <div><b>Customer:</b> ${escapeHtml(o.customerName)}</div>
      <div><b>Engineer:</b> ${escapeHtml(o.engineer)}</div>
      <div><b>Model:</b> ${escapeHtml(o.machineModel)}</div>
      <div><b>Serial:</b> ${escapeHtml(o.machineSerial)}</div>

      <div class="solution-highlight">${escapeHtml(o.remedy)}</div>

      ${o.imageUrl ? `<a target="_blank" href="${o.imageUrl}">📷 View Image</a>` : ""}

      <button onclick="deleteOccurrence('${o.occurrenceId}')">🗑 Delete</button>
    </div>
    `;
  });

  html += "</div>";
  $("searchResult").innerHTML = html;
}

/* ---------- EXPORT ---------- */
function exportOccurrences() {
  const data = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");
  if (!data.length) return alert("No data");

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pcam_occurrences.json";
  a.click();
}

/* ---------- IMPORT ---------- */
function importOccurrences(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.occurrences)
        ? parsed.occurrences
        : [];

      const map = {};
      [...occurrences, ...incoming].forEach(o => {
        if (o.occurrenceId) map[o.occurrenceId] = o;
      });

      occurrences = Object.values(map);
      localStorage.setItem(OCC_KEY, JSON.stringify(occurrences));
      alert("Import complete ✔ (" + incoming.length + ")");
      searchAndRender();
    } catch {
      alert("Invalid JSON");
    }
  };
  reader.readAsText(file);
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  loadOccurrencesLocal();

  $("btnEnter").onclick = () => {
    if ($("passwordInput").value !== PASSWORD) return alert("Wrong password");

    $("passwordCard").classList.add("hidden");
    $("appContainer").classList.remove("hidden");
    $("mainCard").classList.remove("hidden");

    fetchErrors();
    searchAndRender();
  };

  $("btnSearch").onclick = searchAndRender;
  $("btnSaveOcc").onclick = saveOccurrenceLocal;
  $("btnExportOcc").onclick = exportOccurrences;

  const file = $("importFile");
  $("btnImportOcc").onclick = () => file.click();
  file.onchange = () => importOccurrences(file.files[0]);
});
