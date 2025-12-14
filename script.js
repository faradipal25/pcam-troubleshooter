/* script.js — PCAM Troubleshooter (GET-ONLY, CORS-SAFE) */

console.log("SCRIPT LOADED: OK");

const API_URL = "https://script.google.com/macros/s/AKfycbxAE_asBdIOT6NhGe6bk-bP0eFeUSe2HjKQLkyh1ET7XdbcNtpBtJ8cDbaL_BDQPjsM/exec";
const PASSWORD = "SIKIPAL@dip";

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
  return String(k || "").replace(/^E/i, "").padStart(3, "0");
}

/* ---------- GET helper ---------- */
async function apiGet(url){
  dbg("GET " + url);
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }catch(e){
    dbg("GET failed: " + e);
    return null;
  }
}

/* ---------- fetch errors ---------- */
async function fetchErrors(){
  const list = await apiGet(API_URL + "?action=getErrors");
  if(!Array.isArray(list)) return;

  errorDatabase = {};
  list.forEach(r=>{
    const k = padKey(r.error_number ?? r.Error_Number ?? "");
    if(k){
      errorDatabase[k] = { message: r.message ?? r.Message ?? "" };
    }
  });

  dbg("Errors cached: " + Object.keys(errorDatabase).length);
  populateErrorDropdown();
}

/* ---------- fetch occurrences ---------- */
async function fetchOccurrences(){
  const list = await apiGet(API_URL + "?action=getOccurrences");
  if(!Array.isArray(list)) return;

  occurrences = list.map(r=>({
    error_number: padKey(r.error_number),
    date: r.date || "",
    customerName: r.customerName || "",
    remedy: r.remedy || "",
    imageUrl: r.imageUrl || ""
  }));

  dbg("Occurrences cached: " + occurrences.length);
}

/* ---------- SAVE OCCURRENCE (GET ONLY) ---------- */
async function saveOccurrence(){
  const code = padKey($("occCode").value);
  if(!code) return alert("Select error code");

  const params = new URLSearchParams({
    action: "addOccurrence",
    error_number: code,
    date: $("occDate").value || new Date().toISOString().slice(0,10),
    customerName: $("occCustomer").value || "",
    remedy: $("occRemedy").value || "",
    imageUrl: $("occImageUrl") ? $("occImageUrl").value.trim() : ""
  });

  const url = API_URL + "?" + params.toString();
  dbg("Saving via GET");

  const res = await apiGet(url);
  if(res && res.status === "ok"){
    alert("Occurrence saved");
    fetchOccurrences();
  }else{
    alert("Save failed");
  }
}
async function saveOccurrence(){
  const code = $("occCode").value;
  if(!code){
    alert("Select an error code");
    return;
  }

  const params = new URLSearchParams({
    action: "addOccurrence",
    error_number: padKey(code),
    date: $("occDate") ? $("occDate").value : "",
    customerName: $("occCustomer") ? $("occCustomer").value : "",
    remedy: $("occRemedy") ? $("occRemedy").value : "",
    imageUrl: $("occImageUrl") ? $("occImageUrl").value : ""
  });

  const url = API_URL + "?" + params.toString();
  dbg("Saving via GET");
  dbg(url);

  const res = await apiGet(url);

  if(res && res.status === "ok"){
    alert("Occurrence saved");
    await fetchOccurrences();
  } else {
    alert("Save failed");
  }
}

/* ---------- UI ---------- */
function populateErrorDropdown(){
  const dd = $("occCode");
  dd.innerHTML = '<option value="">-- select --</option>';
  Object.keys(errorDatabase).sort().forEach(k=>{
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k + " — " + errorDatabase[k].message;
    dd.appendChild(o);
  });
}

function searchAndRender(){
  const k = padKey($("errorCode").value);
  const occs = occurrences.filter(o=>o.error_number === k);

  let html = `<h3>${k}</h3><h4>Occurrences (${occs.length})</h4>`;
  occs.forEach(o=>{
    html += `<div style="margin-bottom:10px">
      ${o.date} — ${o.customerName}<br>
      ${o.remedy}<br>
      ${o.imageUrl ? `<a target="_blank" href="${o.imageUrl}">Image</a>` : ""}
    </div><hr>`;
  });
  $("searchResult").innerHTML = html;
}
function saveOccurrenceLocal(){
  const code = $("occCode").value;
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
  localStorage.setItem("pcam_local_occ", JSON.stringify(occurrences));

  dbg("Saved locally: " + JSON.stringify(occ));
  alert("Saved locally ✔");

  searchAndRender();
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", ()=>{dbg("SCRIPT ready");

  $("btnEnter").onclick = ()=>{
    if($("btnSaveOcc")) $("btnSaveOcc").onclick = saveOccurrenceLocal;
    if($("passwordInput").value === PASSWORD){
      $("passwordCard").classList.add("hidden");
      $("mainCard").classList.remove("hidden");
      fetchErrors();
      fetchOccurrences();
    }else{
      alert("Wrong password");
    }
  };

  $("btnSearch").onclick = searchAndRender;
  $("btnSaveOcc").onclick = saveOccurrence;
   

});
