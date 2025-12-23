import { login, logout, getToken } from "./auth.js";
import { getMe, getMyPlaylists, getPlaylistTracks, getAudioFeatures } from "./spotify.js";

const $ = (id) => document.getElementById(id);

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const meEl = $("me");
const statusEl = $("status");
const playlistSelect = $("playlistSelect");
const loadBtn = $("loadBtn");
const applyBtn = $("applyBtn");
const exportBtn = $("exportBtn");
const sortField = $("sortField");
const sortDir = $("sortDir");
const minVal = $("minVal");
const maxVal = $("maxVal");
const tbody = $("table").querySelector("tbody");
const stats = $("stats");
const featuresWarning = $("featuresWarning");

let currentRows = []; // [{ track, features }]

function setStatus(msg) { statusEl.textContent = msg ?? ""; }

function fmtMs(ms) {
  const s = Math.round((ms ?? 0) / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getFieldValue(row, field) {
  const t = row.track;
  const f = row.features;
  if (field === "name") return t?.name ?? "";
  if (field === "popularity") return t?.popularity ?? null;
  if (field === "duration_ms") return t?.duration_ms ?? null;
  return f ? (f[field] ?? null) : null;
}

function renderTable(rows) {
  tbody.innerHTML = "";
  rows.forEach((row, idx) => {
    const t = row.track;
    const f = row.features;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><a href="${t.external_urls?.spotify ?? "#"}" target="_blank" rel="noreferrer">${t.name ?? ""}</a></td>
      <td>${(t.artists ?? []).map(a => a.name).join(", ")}</td>
      <td>${f?.tempo != null ? f.tempo.toFixed(1) : "—"}</td>
      <td>${f?.energy != null ? f.energy.toFixed(3) : "—"}</td>
      <td>${f?.loudness != null ? f.loudness.toFixed(1) : "—"}</td>
      <td>${t.popularity ?? "—"}</td>
      <td>${t.duration_ms != null ? fmtMs(t.duration_ms) : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  stats.textContent = `Tracks: ${rows.length}`;
}

function applySortAndFilter() {
  const field = sortField.value;
  const dir = sortDir.value;
  const minN = minVal.value === "" ? null : numOrNull(minVal.value);
  const maxN = maxVal.value === "" ? null : numOrNull(maxVal.value);

  let rows = [...currentRows];

  if (minN != null || maxN != null) {
    rows = rows.filter(r => {
      const v = getFieldValue(r, field);
      if (v == null || typeof v !== "number") return false;
      if (minN != null && v < minN) return false;
      if (maxN != null && v > maxN) return false;
      return true;
    });
  }

  rows.sort((a, b) => {
    const va = getFieldValue(a, field);
    const vb = getFieldValue(b, field);

    if (typeof va === "string" || typeof vb === "string") {
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    }

    const na = (typeof va === "number") ? va : Infinity;
    const nb = (typeof vb === "number") ? vb : Infinity;
    return dir === "asc" ? (na - nb) : (nb - na);
  });

  renderTable(rows);
}

function exportCsv() {
  const fieldList = [
    "name", "artists", "tempo", "energy", "loudness", "danceability", "valence",
    "popularity", "duration_ms", "url"
  ];

  const lines = [];
  lines.push(fieldList.join(","));

  for (const r of currentRows) {
    const t = r.track;
    const f = r.features ?? {};
    const row = {
      name: (t.name ?? "").replaceAll('"', '""'),
      artists: (t.artists ?? []).map(a => a.name).join(" / ").replaceAll('"', '""'),
      tempo: f.tempo ?? "",
      energy: f.energy ?? "",
      loudness: f.loudness ?? "",
      danceability: f.danceability ?? "",
      valence: f.valence ?? "",
      popularity: t.popularity ?? "",
      duration_ms: t.duration_ms ?? "",
      url: t.external_urls?.spotify ?? "",
    };

    lines.push(fieldList.map(k => `"${String(row[k] ?? "")}"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "playlist_sorted.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  loginBtn.onclick = () => login();
  logoutBtn.onclick = () => { logout(); window.location.reload(); };
  applyBtn.onclick = () => applySortAndFilter();
  exportBtn.onclick = () => exportCsv();

  const token = getToken();
  if (!token?.access_token) {
    setStatus("No autenticado. Click en “Login con Spotify”.");
    playlistSelect.innerHTML = `<option value="">(login requerido)</option>`;
    loadBtn.disabled = true;
    applyBtn.disabled = true;
    exportBtn.disabled = true;
    logoutBtn.disabled = true;
    return;
  }

  setStatus("Autenticado. Cargando perfil y playlists…");
  logoutBtn.disabled = false;

  const me = await getMe();
  meEl.textContent = `${me.display_name ?? me.id ?? ""}`;

  const playlists = await getMyPlaylists();
  playlists.sort((a, b) =>
    (a.name ?? "").localeCompare((b.name ?? ""), "es", { sensitivity: "base" })
  );
  playlistSelect.innerHTML = `<option value="">(seleccioná una)</option>` + playlists
    .map(p => `<option value="${p.id}">${p.name} (${p.tracks?.total ?? 0})</option>`)
    .join("");

  loadBtn.disabled = false;
  applyBtn.disabled = false;
  exportBtn.disabled = false;

  loadBtn.onclick = async () => {
    const pid = playlistSelect.value;
    if (!pid) return;

    featuresWarning.textContent = "";
    setStatus("Cargando tracks…");
    tbody.innerHTML = "";
    stats.textContent = "";

    const tracks = await getPlaylistTracks(pid);
    setStatus(`Tracks cargados: ${tracks.length}. Intentando audio-features…`);

    const rows = tracks.map(t => ({ track: t, features: null }));

    try {
      const ids = tracks.map(t => t.id);
      const byId = await getAudioFeatures(ids);
      for (const r of rows) r.features = byId.get(r.track.id) ?? null;
      setStatus("OK: audio-features cargados. Ya podés ordenar por BPM/energy/loudness.");
    } catch (e) {
      if (e?.status === 403) {
        featuresWarning.textContent =
          "⚠️ Tu app no tiene acceso a Audio Features (Spotify suele devolver 403 en apps nuevas). Podés ordenar por metadata estándar (popularity, duration, name).";
        setStatus("Audio-features no disponibles (403). Fallback a metadata estándar.");
      } else {
        featuresWarning.textContent = "⚠️ Error intentando audio-features: " + (e?.message ?? String(e));
        setStatus("Error al cargar audio-features.");
      }
    }

    currentRows = rows;
    renderTable(currentRows);
    applySortAndFilter();
  };

  setStatus("Listo.");
}

init().catch(e => {
  console.error(e);
  setStatus("Error: " + (e?.message ?? String(e)));
});
