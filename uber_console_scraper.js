// ============================================================
//  UBER TRIP SCRAPER — Coller dans la console F12
//  Cible : toutes les courses depuis janvier 2026
// ============================================================

(async () => {

  const DATE_FROM = new Date("2026-01-01");
  const trips     = [];
  const seenIds   = new Set();
  const delay     = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Intercepter les appels API Uber ----------
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");
    if (url.includes("trips") || url.includes("activity") || url.includes("earnings")) {
      res.clone().json().then(data => {
        const list =
          data?.trips ||
          data?.data?.trips ||
          data?.activities ||
          data?.data?.activities ||
          data?.data ||
          [];
        if (Array.isArray(list)) {
          list.forEach(t => {
            const id = t.uuid || t.tripUUID || t.id || JSON.stringify(t).slice(0, 40);
            if (!seenIds.has(id)) {
              seenIds.add(id);
              trips.push(t);
            }
          });
        }
      }).catch(() => {});
    }
    return res;
  };

  // ---------- Scroll infini jusqu'à janvier 2026 ----------
  console.log("🚀 Démarrage — chargement de toutes les courses depuis janvier 2026...");
  console.log("⏳ Ne pas fermer la console ni la page !");

  let sameCount   = 0;
  let lastCount   = 0;
  let iteration   = 0;
  let stopReason  = "";

  while (sameCount < 8) {
    iteration++;

    // Scroll vers le bas
    window.scrollTo(0, document.body.scrollHeight);
    await delay(2000);

    // Chercher le bouton "Charger plus" s'il existe
    const loadMoreBtn = [
      ...document.querySelectorAll("button, [role='button']")
    ].find(el =>
      /load more|voir plus|show more|plus de/i.test(el.innerText)
    );
    if (loadMoreBtn) {
      loadMoreBtn.click();
      console.log("  → Bouton 'charger plus' cliqué");
      await delay(2000);
    }

    // Vérifier si on a atteint janvier 2026 dans le DOM
    const allDates = [...document.querySelectorAll(
      "[class*='date'], [class*='Date'], [data-testid*='date'], time"
    )].map(e => e.innerText.trim()).filter(Boolean);

    const oldestVisible = allDates[allDates.length - 1];

    console.log(
      `[${iteration}] Courses API: ${trips.length} | ` +
      `Dernière date visible: ${oldestVisible || "?"} | ` +
      `Scroll: ${Math.round(window.scrollY)}px`
    );

    // Stop si on voit des dates avant janvier 2026
    if (oldestVisible) {
      const d = new Date(oldestVisible);
      if (!isNaN(d) && d < DATE_FROM) {
        stopReason = `Date ${oldestVisible} avant janvier 2026 atteinte`;
        break;
      }
    }

    if (trips.length === lastCount) sameCount++;
    else { sameCount = 0; lastCount = trips.length; }
  }

  stopReason = stopReason || (sameCount >= 8 ? "Plus rien à charger" : "Fin");
  console.log(`\n✅ Chargement terminé — Raison: ${stopReason}`);

  // ---------- Fallback DOM si API non capturée ----------
  if (trips.length === 0) {
    console.log("⚠️  API non capturée — scraping du DOM...");
    const rows = document.querySelectorAll(
      '[data-testid*="trip"], [class*="TripRow"], [class*="trip-row"], ' +
      '[class*="ActivityRow"], [class*="activityRow"], [class*="HistoryRow"]'
    );
    rows.forEach(row => trips.push({ _dom: row.innerText.replace(/\n/g, " | ") }));
    console.log(`DOM: ${trips.length} lignes trouvées.`);
  }

  console.log(`\n📊 Total courses collectées : ${trips.length}`);

  // ---------- Construire le CSV ----------
  function flattenObj(obj, prefix = "", res = {}) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}_${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flattenObj(v, key, res);
      else res[key] = Array.isArray(v) ? v.join("; ") : v;
    }
    return res;
  }

  function csvCell(v) {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }

  const isApi = trips.length > 0 && !trips[0]._dom;
  let csvRows = [];

  if (isApi) {
    const headers = new Set();
    trips.forEach(t => Object.keys(flattenObj(t)).forEach(k => headers.add(k)));
    const cols = [...headers];
    csvRows.push(cols.join(","));
    trips.forEach(t => {
      const flat = flattenObj(t);
      csvRows.push(cols.map(c => csvCell(flat[c] ?? "")).join(","));
    });
  } else {
    csvRows.push("raw_text");
    trips.forEach(t => csvRows.push(csvCell(t._dom || t)));
  }

  const csv = csvRows.join("\n");

  // ---------- Télécharger ----------
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "uber_trips_2026.csv";
  a.click();
  URL.revokeObjectURL(url);

  console.log(`\n✅ Fichier uber_trips_2026.csv téléchargé — ${trips.length} courses.`);
})();
