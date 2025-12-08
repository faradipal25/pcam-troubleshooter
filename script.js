console.log("SCRIPT LOADED: OK");

/* ===============================
   CONFIG
================================*/
const PASSWORD = "SIKIPAL@dip";

/* Helper functions */
const $ = id => document.getElementById(id);
const debug = msg => {
  const box = $("debug");
  box.textContent =
    new Date().toISOString() + " — " + msg + "\n" + box.textContent;
  console.log(msg);
};

window.__pcam = {
  errors: {},
  occurrences: []
};

/* ===============================
   PASSWORD GATE
================================*/
function initPassword() {
  $("btnEnter").onclick = () => {
    if ($("passwordInput").value === PASSWORD) {
      $("passwordCard").classList.add("hidden");
      $("mainCard").classList.remove("hidden");
      debug("Password OK — loading data...");
      loadErrors();
      loadOccurrences();
    } else {
      alert("Wrong password");
    }
  };
}

/* ===============================
   LOAD ERRORS FROM GOOGLE SCRIPT
================================*/
function loadErrors() {
  debug("Calling getErrors()");

  google.script.run
    .withSuccessHandler(list => {
      debug("getErrors returned " + list.length + " rows");

      window.__pcam.errors = {};
      list.forEach(r => {
        const key = pad(r.error_number || r.Error_Number || r.NO || "");
        window.__pcam.errors[key] = r.message || "";
      });

      // Populate dropdown
      const dd = $("occCode");
      dd.innerHTML = "";
      Object.keys(window.__pcam.errors).forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code + " — " + window.__pcam.errors[code];
        dd.appendChild(opt);
      });

      debug("Errors cached");
    })
    .withFailureHandler(err => debug("getErrors FAILED: " + JSON.stringify(err)))
    .getErrors();
}

/* ===============================
   LOAD OCCURRENCES
================================*/
function loadOccurrences() {
  debug("Calling getOccurrences()");

  google.script.run
    .withSuccessHandler(list => {
      debug("getOccurrences returned " + list.length + " rows");

      window.__pcam.occurrences = list;

      debug("Occurrences cached: " + list.length);
    })
    .withFailureHandler(err =>
      debug("getOccurrences FAILED: " + JSON.stringify(err))
    )
    .getOccurrences();
}

/* ===============================
   SEARCH
================================*/
function search() {
  const raw = $("errorCode").value.trim();
  const key = pad(raw);

  if (!window.__pcam.errors[key]) {
    $("searchResult").innerHTML = "<b>Not found</b>";
    return;
  }

  const e = window.__pcam.errors[key];
  const occs = window.__pcam.occurrences.filter(o => pad(o.error_number) === key);

  let html = `<h3>${key}</h3><p>${e}</p><h4>Occurrences (${occs.length})</h4>`;
  occs.forEach(o => {
    html += `<div>${o.date} — ${o.customerName}`;
    if (o.imageUrl) html += ` — <a target="_blank" href="${o.imageUrl}">image</a>`;
    html += `</div>`;
  });

  $("searchResult").innerHTML = html;
}

/* ===============================
   SAVE OCCURRENCE TEST
================================*/
async function saveOcc() {
  const code = $("occCode").value;
  if (!code) return alert("Select error code");

  const occ = {
    error_number: code,
    date: $("occDate").value,
    customerName: $("occCustomer").value,
    remedy: $("occRemedy").value
  };

  const file = $("occImage").files[0];
  if (file) {
    const dataUrl = await fileToDataURL(file);
    occ.imageDataUrl = dataUrl;

    $("imgPreview").src = dataUrl;
    $("imgPreview").classList.remove("hidden");
  }

  debug("Sending addOccurrence()...");

  google.script.run
    .withSuccessHandler(res => {
      debug("addOccurrence success: " + JSON.stringify(res));
      alert("Saved ✔");
      loadOccurrences();
    })
    .withFailureHandler(err => {
      debug("addOccurrence FAILED: " + JSON.stringify(err));
      alert("Save failed ❌");
    })
    .addOccurrence(occ);
}

/* ===============================
   HELPERS
================================*/
function pad(k) {
  return String(k).replace(/^E/i, "").padStart(3, "0");
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = e => rej(e);
    fr.readAsDataURL(file);
  });
}

/* ===============================
   INIT
================================*/
document.addEventListener("DOMContentLoaded", () => {
  debug("SCRIPT ready");

  initPassword();

  $("btnSearch").onclick = search;
  $("btnSaveOcc").onclick = saveOcc;

  $("btnLoadErrors").onclick = loadErrors;
  $("btnLoadOccurrences").onclick = loadOccurrences;
  $("btnShowCache").onclick = () => {
    $("debug").textContent =
      JSON.stringify(window.__pcam.occurrences, null, 2);
  };
});
