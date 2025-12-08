console.log("script.js loaded");

// === CONFIG ===
const API_BASE =
  "https://script.google.com/macros/s/AKfycbw_VVf-TQ1ShPPiDP3VdYEAlVTfcvqenmXk4GbBIEodvn5dTKuB-PvSMZ6LOSf0Tn9i/exec"; 
// <-- your backend URL

// === Load Errors ===
async function loadErrors() {
  console.log("Loading errors...");
  try {
    const res = await fetch(`${API_BASE}?action=getErrors`);
    const data = await res.json();
    console.log("Errors received:", data);

    window.errorDB = data;
    fillErrorDropdown(data);
  } catch (e) {
    console.error("Error loading errors", e);
  }
}

// === Load Occurrences ===
async function loadOccurrences() {
  console.log("Loading occurrences...");
  try {
    const res = await fetch(`${API_BASE}?action=getOccurrences`);
    const data = await res.json();
    console.log("Occurrences received:", data);

    window.occDB = data;
  } catch (e) {
    console.error("Error loading occurrences", e);
  }
}

// === Fill dropdown ===
function fillErrorDropdown(list) {
  const dropdown = document.getElementById("occCode");
  dropdown.innerHTML = "";

  list.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.error_number;
    opt.textContent = `${item.error_number} — ${item.message || ""}`;
    dropdown.appendChild(opt);
  });
}

// === Search (simple) ===
function searchCode() {
  const input = document.getElementById("errorCode").value.trim();
  const key = input.padStart(3, "0");

  const errors = window.errorDB || [];
  const occs = window.occDB || [];

  const match = errors.find(e => String(e.error_number) === key);

  const resultDiv = document.getElementById("searchResult");

  if (!match) {
    resultDiv.innerHTML = "Not found";
    return;
  }

  let html = `<h3>${key}</h3><p>${match.message || ""}</p>`;

  const related = occs.filter(o => String(o.error_number) === key);

  html += `<h4>Occurrences: ${related.length}</h4>`;
  related.forEach(o => {
    html += `<div>${o.date} — ${o.customerName}</div>`;
  });

  resultDiv.innerHTML = html;
}

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Ready");

  // Attach buttons
  document.getElementById("btnSearch").onclick = searchCode;
  document.getElementById("btnLoadErrors").onclick = loadErrors;
  document.getElementById("btnLoadOccurrences").onclick = loadOccurrences;

  console.log("UI buttons connected");
});
