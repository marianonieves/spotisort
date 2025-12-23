import { login, logout, getToken } from "./auth.js";
import {
  getMe,
  getMyPlaylists,
  getPlaylistTracks,
  createPlaylist,
  addPlaylistItems,
  overwritePlaylistItems,
  // getAudioFeatures,
} from "./spotify.js";


function trackEvent(event, params = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
const $ = (id) => document.getElementById(id);

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const meEl = $("me");
const statusEl = $("status");
const appSection = $("appSection");
const playlistSelect = $("playlistSelect");
const loadBtn = $("loadBtn");
const sortPlaylistBtn = $("sortPlaylistBtn");
const resetBtn = $("resetBtn");

const intelligentBtn = $("intelligentBtn");
const randomBtn = $("randomBtn");

const exportBtn = $("exportBtn");
const shareBtn = $("shareBtn");
const shareMsg = $("shareMsg");
const saveBtn = $("saveBtn");
const overwriteBtn = $("overwriteBtn");
const saveStatus = $("saveStatus");
const featuresWarning = $("featuresWarning");
const tbody = $("table").querySelector("tbody");
const stats = $("stats");
const thead = $("table").querySelector("thead");

let me = null;
let currentPlaylist = null; // {id,name}
let currentRows = []; // [{ track }]
let visibleRows = []; // sorted rows

const sortState = {
  field: null,
  dir: "desc", // 'asc' | 'desc'
};

function setStatus(msg) {
  statusEl.textContent = msg ?? "";
}

function getCleanUrl() {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  return u.toString();
}

function setShareMsg(text) {
  if (!shareMsg) return;
  shareMsg.textContent = text ?? "";
}

function setSaveStatus(msg, { html = false } = {}) {
  if (html) saveStatus.innerHTML = msg ?? "";
  else saveStatus.textContent = msg ?? "";
}

function fmtMs(ms) {
  const s = Math.round((ms ?? 0) / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function getFieldValue(row, field) {
  const t = row.track;
  if (field === "index") return row.__index ?? 0;
  if (field === "name") return t?.name ?? "";
  if (field === "artist") return (t?.artists ?? [])[0]?.name ?? "";
  if (field === "popularity") return t?.popularity ?? null;
  if (field === "duration_ms") return t?.duration_ms ?? null;
  return null;
}

function setActiveHeader() {
  const ths = Array.from(thead.querySelectorAll("th[data-field]"));
  for (const th of ths) {
    const f = th.dataset.field;
    if (f === sortState.field) {
      th.classList.add("active");
      th.setAttribute("data-dir", sortState.dir === "asc" ? "▲" : "▼");
    } else {
      th.classList.remove("active");
      th.removeAttribute("data-dir");
    }
  }
}

function applySort() {
  if (!sortState.field) {
    visibleRows = currentRows.map((r, i) => ({ ...r, __index: i + 1 }));
    renderTable(visibleRows);
    setActiveHeader();
    return;
  }
  const { field, dir } = sortState;
  const rows = currentRows.map((r, i) => ({ ...r, __index: i + 1 }));

  rows.sort((a, b) => {
    const va = getFieldValue(a, field);
    const vb = getFieldValue(b, field);

    // Strings
    if (typeof va === "string" || typeof vb === "string") {
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    }

    // Numbers
    const na = typeof va === "number" ? va : -Infinity;
    const nb = typeof vb === "number" ? vb : -Infinity;
    return dir === "asc" ? (na - nb) : (nb - na);
  });

  visibleRows = rows;
  renderTable(visibleRows);
  setActiveHeader();
}

function applyIntelligentSort() {
  // Criteria:
  // 1) Higher popularity first
  // 2) If same popularity, shorter duration first
  // 3) Tie-breaker: name A→Z
  const rows = currentRows.map((r, i) => ({ ...r, __index: i + 1 }));

  rows.sort((a, b) => {
    const pa = a.track?.popularity ?? -Infinity;
    const pb = b.track?.popularity ?? -Infinity;
    if (pa !== pb) return pb - pa;

    const da = a.track?.duration_ms ?? Infinity;
    const db = b.track?.duration_ms ?? Infinity;
    if (da !== db) return da - db;

    const na = String(a.track?.name ?? "");
    const nb = String(b.track?.name ?? "");
    return na.localeCompare(nb, undefined, { sensitivity: "base" });
  });

  // Clear column highlight (this is a custom sort)
    sortState.dir = "desc";
  visibleRows = rows;
  renderTable(visibleRows);
  setActiveHeader();

  trackEvent("intelligent_sort", {
    playlist_id: currentPlaylist?.id ?? "",
    tracks: visibleRows.length,
  });
}

function applyRandomSort() {
  const rows = currentRows.map((r, i) => ({ ...r, __index: i + 1 }));

  // Fisher–Yates shuffle
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

    sortState.dir = "desc";
  visibleRows = rows;
  renderTable(visibleRows);
  setActiveHeader();

  trackEvent("random_sort", {
    playlist_id: currentPlaylist?.id ?? "",
    tracks: visibleRows.length,
  });
}

function renderTable(rows) {
  tbody.innerHTML = "";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const t = row.track;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">${i + 1}</td>
      <td><a href="${t.external_urls?.spotify ?? "#"}" target="_blank" rel="noreferrer">${t.name ?? ""}</a></td>
      <td>${(t.artists ?? []).map(a => a.name).join(", ")}</td>
      <td class="num">${t.popularity ?? "—"}</td>
      <td class="num">${t.duration_ms != null ? fmtMs(t.duration_ms) : "—"}</td>
    `;
    tbody.appendChild(tr);
  }
  stats.textContent = rows.length ? `Tracks: ${rows.length}` : "";
}

function exportCsv() {
  const fieldList = ["name", "artists", "popularity", "duration_ms", "url"];
  const lines = [];
  lines.push(fieldList.join(","));

  for (const r of visibleRows) {
    const t = r.track;
    const row = {
      name: (t.name ?? "").replaceAll('"', '""'),
      artists: (t.artists ?? []).map(a => a.name).join(" / ").replaceAll('"', '""'),
      popularity: t.popularity ?? "",
      duration_ms: t.duration_ms ?? "",
      url: t.external_urls?.spotify ?? "",
    };
    lines.push(fieldList.map(k => `"${String(row[k] ?? "")}"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spotisort.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function getSortedTrackUris() {
  return visibleRows
    .map(r => r.track)
    .filter(t => t?.id)
    .map(t => `spotify:track:${t.id}`);
}

async function saveAsNewPlaylist() {
  if (!me?.id) throw new Error("Missing user id");
  if (!currentPlaylist?.name) throw new Error("Pick a playlist first");

  const uris = getSortedTrackUris();
  if (!uris.length) throw new Error("No tracks loaded");

  const suffix =
    sortState.field && sortState.field !== "__custom__"
      ? `${sortState.field} ${sortState.dir}`
      : "custom sort";

  const name = `${currentPlaylist.name} (SpotiSort · ${suffix})`;

  setSaveStatus("Creating a new playlist…");
  trackEvent("save_new_start", { playlist_id: currentPlaylist?.id ?? "", tracks: uris.length });

  const created = await createPlaylist(me.id, name, {
    description: "Sorted with Spoti Sort",
    isPublic: false,
  });

  setSaveStatus("Adding tracks…");
  await addPlaylistItems(created.id, uris);

  const url = created?.external_urls?.spotify || `https://open.spotify.com/playlist/${created.id}`;
  setSaveStatus(
    `Done ✅ New playlist created. <a href="${url}" target="_blank" rel="noreferrer">Open it on Spotify</a>`,
    { html: true }
  );
  trackEvent("save_new_done", { new_playlist_id: created.id, tracks: uris.length });
}

async function overwriteCurrentPlaylist() {
  if (!currentPlaylist?.id) throw new Error("Pick a playlist first");

  const uris = getSortedTrackUris();
  if (!uris.length) throw new Error("No tracks loaded");

  // Safety confirmation without a modal (keeps it static + simple)
  const ok = window.confirm(
    `Overwrite "${currentPlaylist.name}" on Spotify?\n\nThis will replace the track order in the selected playlist.`
  );
  if (!ok) return;

  setSaveStatus("Overwriting playlist order…");
  trackEvent("overwrite_start", { playlist_id: currentPlaylist.id, tracks: uris.length });

  await overwritePlaylistItems(currentPlaylist.id, uris);

  const url = `https://open.spotify.com/playlist/${currentPlaylist.id}`;
  setSaveStatus(
    `Done ✅ Playlist updated. <a href="${url}" target="_blank" rel="noreferrer">Open it on Spotify</a>`,
    { html: true }
  );

  trackEvent("overwrite_done", { playlist_id: currentPlaylist.id, tracks: uris.length });
}

async function init() {
  loginBtn.onclick = () => {
    trackEvent("login_click");
    login();
  };

  logoutBtn.onclick = () => {
    trackEvent("logout_click");
    logout();
    window.location.reload();
  };

  sortPlaylistBtn.onclick = async () => {
    // Convenience: load (if needed) and toggle Popularity sort (desc ⇄ asc)
    trackEvent("sort_by_popularity_click");
    if (!playlistSelect.value) {
      setStatus("Pick a playlist first.");
      return;
    }
    if (!currentRows?.length || currentPlaylist?.id !== playlistSelect.value) {
      await loadBtn.onclick();
    }

    if (sortState.field !== "popularity") {
      sortState.field = "popularity";
      sortState.dir = "desc";
    } else {
      sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
    }

    applySort();
    setStatus(`Sorted by Popularity (${sortState.dir === "desc" ? "desc" : "asc"}). Now you can save it to Spotify.`);
  };


  intelligentBtn.onclick = () => applyIntelligentSort();
  randomBtn.onclick = () => applyRandomSort();

  resetBtn.onclick = () => {
    // Restore original playlist order (as returned by Spotify)
    trackEvent("reset_order");
    sortState.field = null;
    visibleRows = currentRows.map((r, i) => ({ ...r, __index: i + 1 }));
    renderTable(visibleRows);
    setActiveHeader();
    setStatus("Reset to the original playlist order.");
  };

  exportBtn.onclick = () => {
    trackEvent("export_csv", { playlist_id: currentPlaylist?.id ?? "", tracks: visibleRows.length });
    exportCsv();
  };

  saveBtn.onclick = () =>
    saveAsNewPlaylist().catch((e) =>
      setSaveStatus(`Error: ${e?.message ?? String(e)}`)
    );

  overwriteBtn.onclick = () =>
    overwriteCurrentPlaylist().catch((e) =>
      setSaveStatus(`Error: ${e?.message ?? String(e)}`)
    );

  // Click-to-sort
  thead.addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-field]");
    if (!th) return;
    const field = th.dataset.field;
    if (!field || field === "index") return;

    if (sortState.field === field) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.field = field;
      sortState.dir = "desc";
    }

    trackEvent("sort_column", {
      playlist_id: currentPlaylist?.id ?? "",
      field,
      dir: sortState.dir,
    });


    applySort();
    });

  const token = getToken();
  if (!token?.access_token) {
    setStatus("Not authenticated. Click “Login with Spotify”.");
    appSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    meEl.classList.add("hidden");
    return;
  }

  // Logged in
  // Hide the info module so users don't need to scroll after login
  const infoModule = document.getElementById("infoModule");
  if (infoModule) infoModule.classList.add("hidden");

  setStatus("Loading your profile and playlists…");
  appSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  meEl.classList.remove("hidden");
  loginBtn.classList.add("hidden");

  me = await getMe();
  meEl.textContent = `Logged in as ${me.display_name ?? me.id ?? ""}`;

  const playlists = await getMyPlaylists();
  playlists.sort((a, b) => (a?.name ?? "").localeCompare((b?.name ?? ""), undefined, { sensitivity: "base" }));

  playlistSelect.innerHTML =
    `<option value="">Select a playlist…</option>` +
    playlists.map(p => `<option value="${p.id}">${p.name} (${p.tracks?.total ?? 0})</option>`).join("");

  loadBtn.disabled = false;
  exportBtn.disabled = true;
  saveBtn.disabled = true;
  overwriteBtn.disabled = true;
  intelligentBtn.disabled = true;
  randomBtn.disabled = true;

  loadBtn.onclick = async () => {
    const pid = playlistSelect.value;
    if (!pid) return;

    featuresWarning.textContent = "";
    setSaveStatus("");
    tbody.innerHTML = "";
    stats.textContent = "";

    const selectedName = playlistSelect.options[playlistSelect.selectedIndex]?.textContent ?? "";
    currentPlaylist = { id: pid, name: selectedName.replace(/\s*\(\d+\)\s*$/, "") };

    setStatus("Loading tracks…");
    const tracks = await getPlaylistTracks(pid);
    currentRows = tracks.map(t => ({ track: t }));

    applySort();
    setStatus("Ready.");
    exportBtn.disabled = false;
    saveBtn.disabled = false;
    overwriteBtn.disabled = false;
    intelligentBtn.disabled = false;
    randomBtn.disabled = false;
    sortPlaylistBtn.disabled = false;
    resetBtn.disabled = false;

    trackEvent("playlist_loaded", {
      playlist_id: pid,
      tracks: currentRows.length,
    });
  };

  setStatus("Ready.");
}

init().catch((e) => {
  console.error(e);
  setStatus("Error: " + (e?.message ?? String(e)));
});
