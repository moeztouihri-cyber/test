// ============================================================
//  UBER TRIP SCRAPER — Coller dans la console F12
//  Page : https://drivers.uber.com/en/trips
// ============================================================

(async () => {

  const trips = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Utilitaires DOM ----------
  const txt = sel => {
    const el = document.querySelector(sel);
    return el ? el.innerText.trim() : "";
  };

  const allTxt = sel =>
    [...document.querySelectorAll(sel)].map(e => e.innerText.trim());

  // ---------- Intercepter les appels réseau Uber ----------
  // Uber charge les courses via une API interne — on la capture
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url.includes("trips") || url.includes("activity")) {
      const clone = res.clone();
      clone.json().then(data => {
        if (data?.trips || data?.data?.trips || data?.activities) {
          const list = data.trips || data.data?.trips || data.activities || [];
          list.forEach(t => trips.push(t));
          console.log(`📦 ${list.length} courses capturées (total: ${trips.length})`);
        }
      }).catch(() => {});
    }
    return res;
  };

  // ---------- Scroll automatique pour déclencher le chargement ----------
  console.log("⏳ Démarrage du scroll — attendre que toutes les courses chargent...");

  let lastHeight = 0;
  let sameCount  = 0;

  while (sameCount < 5) {
    window.scrollTo(0, document.body.scrollHeight);
    await delay(1500);
    const h = document.body.scrollHeight;
    if (h === lastHeight) sameCount++;
    else { sameCount = 0; lastHeight = h; }
    console.log(`Scroll en cours... hauteur: ${h}px | courses API: ${trips.length}`);
  }

  console.log("✅ Scroll terminé.");

  // ---------- Fallback : scraper le DOM si l'API n'a rien retourné ----------
  if (trips.length === 0) {
    console.log("API non capturée — scraping du DOM...");

    // Sélecteurs génériques — fonctionne sur plusieurs versions de l'UI Uber
    const rows = document.querySelectorAll(
      '[data-testid*="trip"], [class*="TripRow"], [class*="trip-row"], ' +
      '[class*="ActivityRow"], [class*="activityRow"]'
    );

    rows.forEach(row => {
      trips.push({ _dom: row.innerText.replace(/\n/g, " | ") });
    });

    console.log(`DOM: ${trips.length} lignes trouvées.`);
  }

  // ---------- Construire le CSV ----------
  const isApi = trips.length > 0 && !trips[0]._dom;

  let csvRows = [];

  if (isApi) {
    // Données API structurées
    const headers = new Set();
    trips.forEach(t => Object.keys(flattenObj(t)).forEach(k => headers.add(k)));
    const cols = [...headers];
    csvRows.push(cols.join(","));
    trips.forEach(t => {
      const flat = flattenObj(t);
      csvRows.push(cols.map(c => csvCell(flat[c] ?? "")).join(","));
    });
  } else {
    // Données DOM textuelles
    csvRows.push("raw_text");
    trips.forEach(t => csvRows.push(csvCell(t._dom || t)));
  }

  const csv = csvRows.join("\n");

  // ---------- Télécharger le CSV ----------
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "uber_trips.csv";
  a.click();
  URL.revokeObjectURL(url);

  console.log(`\n✅ Téléchargement lancé — ${trips.length} courses exportées.`);
  console.log("Glissez le fichier uber_trips.csv dans le dossier data/ et lancez :");
  console.log("  python uber_trips_to_excel.py data --output uber_trips.xlsx");

  // ---------- Helpers ----------
  function flattenObj(obj, prefix = "", res = {}) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}_${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v))
        flattenObj(v, key, res);
      else
        res[key] = Array.isArray(v) ? v.join("; ") : v;
    }
    return res;
  }

  function csvCell(v) {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }

})();
