import { login, logout, getToken } from "./auth.js";
import {
  getMe,
  getMyPlaylists,
  getPlaylistTracks,
  createPlaylist,
  addItemsToPlaylist,
  replacePlaylistItems,
} from "./spotify.js";

const $ = (id) => document.getElementById(id);

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const meEl = $("me");
const statusEl = $("status");
const appEl = $("app");

const playlistSelect = $("playlistSelect");
const loadBtn = $("loadBtn");
const intelligentBtn = $("intelligentBtn");
const randomBtn = $("randomBtn");
const saveBtn = $("saveBtn");
const overwriteBtn = $("overwriteBtn");
const tbody = $("table").querySelector("tbody");
const tableMeta = $("tableMeta");

let currentRows = [];     // original loaded rows
let displayedRows = [];   // current sorted rows
let currentPlaylistId = null;
let sortState = { field: "popularity", dir: "desc" }; // default

function track(event, params = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

function setStatus(html) {
  statusEl.innerHTML = html ?? "";
}

function fmtMs(ms) {
  const s = Math.round((ms ?? 0) / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rowsToTrackUris(rows) {
  return rows
    .map((r) => r?.track?.id)
    .filter(Boolean)
    .map((id) => `spotify:track:${id}`);
}

function updateSortIndicators() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    const field = th.getAttribute("data-field");
    if (field === sortState.field) th.setAttribute("data-dir", sortState.dir);
    else th.removeAttribute("data-dir");
  });
}

function renderTable(rows) {
  displayedRows = rows;

  tbody.innerHTML = "";
  rows.forEach((row, idx) => {
    const t = row.track;
    const artist = (t.artists ?? []).map((a) => a.name).join(", ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-num">${idx + 1}</td>
      <td><a href="${t.external_urls?.spotify ?? "#"}" target="_blank" rel="noreferrer">${escapeHtml(t.name ?? "")}</a></td>
      <td>${escapeHtml(artist)}</td>
      <td>${t.popularity ?? "—"}</td>
      <td>${t.duration_ms != null ? fmtMs(t.duration_ms) : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  tableMeta.textContent = `Tracks loaded: ${rows.length}. Current sort: ${sortLabel()}`;
}

function sortLabel() {
  if (sortState.field === "__intelligent__") return "Intelligent (popularity ↓, duration ↑)";
  if (sortState.field === "__random__") return "Random";
  const name = {
    name: "Track",
    artist: "Artist",
    popularity: "Popularity",
    duration_ms: "Duration",
  }[sortState.field] ?? sortState.field;
  const dir = sortState.dir === "asc" ? "↑" : "↓";
  return `${name} ${dir}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function getFieldValue(row, field) {
  const t = row.track;
  if (field === "name") return t?.name ?? "";
  if (field === "artist") return (t?.artists?.[0]?.name ?? "");
  if (field === "popularity") return t?.popularity ?? null;
  if (field === "duration_ms") return t?.duration_ms ?? null;
  return null;
}

function applyStandardSort(field, dir) {
  sortState = { field, dir };
  updateSortIndicators();

  const rows = [...currentRows];
  rows.sort((a, b) => {
    const va = getFieldValue(a, field);
    const vb = getFieldValue(b, field);

    // strings
    if (typeof va === "string" || typeof vb === "string") {
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    }

    // numbers (nulls last)
    const na = (typeof va === "number") ? va : Infinity;
    const nb = (typeof vb === "number") ? vb : Infinity;
    return dir === "asc" ? (na - nb) : (nb - na);
  });

  track("sort_applied", { field, dir });
  renderTable(rows);
}

function applyIntelligentSort() {
  sortState = { field: "__intelligent__", dir: "desc" };
  updateSortIndicators();

  const rows = [...currentRows];
  rows.sort((a, b) => {
    const pa = a.track.popularity ?? -1;
    const pb = b.track.popularity ?? -1;
    if (pb !== pa) return pb - pa; // popularity desc

    const da = a.track.duration_ms ?? Number.MAX_SAFE_INTEGER;
    const db = b.track.duration_ms ?? Number.MAX_SAFE_INTEGER;
    return da - db; // duration asc
  });

  track("intelligent_sort");
  renderTable(rows);
}

function applyRandomSort() {
  sortState = { field: "__random__", dir: "desc" };
  updateSortIndicators();

  const rows = [...currentRows];
  // Fisher–Yates shuffle
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  track("random_sort");
  renderTable(rows);
}

function wireTableHeaderSorting() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-field");
      if (!field) return;

      // toggle direction when clicking same column
      let dir = "desc";
      if (sortState.field === field) dir = (sortState.dir === "desc" ? "asc" : "desc");

      applyStandardSort(field, dir);
    });
  });
}

async function saveAsNewPlaylist() {
  if (!displayedRows.length) return;

  const me = await getMe();
  const baseName = playlistSelect.selectedOptions?.[0]?.textContent?.replace(/\s*\(\d+\)\s*$/, "") ?? "Spoti Sort";
  const newName = `${baseName} (Spoti Sort)`;

  setStatus("Creating a new playlist in Spotify…");
  track("save_new_playlist", { source_playlist_id: currentPlaylistId });

  const newPl = await createPlaylist(me.id, {
    name: newName,
    description: `Sorted by ${sortLabel()} • Created with Spoti Sort`,
    isPublic: false,
  });

  const uris = rowsToTrackUris(displayedRows);
  const batches = chunk(uris, 100);

  for (const b of batches) {
    await addItemsToPlaylist(newPl.id, b);
  }

  const link = newPl?.external_urls?.spotify || `https://open.spotify.com/playlist/${newPl.id}`;
  setStatus(`✅ Saved! Open it on Spotify: <a href="${link}" target="_blank" rel="noreferrer">${link}</a>`);
}

async function overwritePlaylist() {
  if (!currentPlaylistId || !displayedRows.length) return;

  const ok = window.confirm("This will overwrite the current playlist order on Spotify. Continue?");
  if (!ok) return;

  setStatus("Overwriting playlist on Spotify…");
  track("overwrite_playlist", { playlist_id: currentPlaylistId });

  const uris = rowsToTrackUris(displayedRows);
  const batches = chunk(uris, 100);

  await replacePlaylistItems(currentPlaylistId, batches[0] ?? []);
  for (const b of batches.slice(1)) {
    await addItemsToPlaylist(currentPlaylistId, b);
  }

  const link = `https://open.spotify.com/playlist/${currentPlaylistId}`;
  setStatus(`✅ Saved! Open it on Spotify: <a href="${link}" target="_blank" rel="noreferrer">${link}</a>`);
}

async function init() {
  // default UI state
  logoutBtn.disabled = true;
  loadBtn.disabled = true;
  intelligentBtn.disabled = true;
  randomBtn.disabled = true;
  saveBtn.disabled = true;
  overwriteBtn.disabled = true;

  loginBtn.addEventListener("click", () => {
    track("login_click");
    login();
  });

  logoutBtn.addEventListener("click", () => {
    track("logout_click");
    logout();
    window.location.reload();
  });

  wireTableHeaderSorting();

  const token = getToken();
  if (!token?.access_token) {
    setStatus("Login to start sorting your playlists.");
    return;
  }

  // authenticated
  appEl.classList.remove("hidden");
  logoutBtn.disabled = false;

  setStatus("Loading your profile and playlists…");
  const me = await getMe();
  meEl.textContent = me.display_name ? `@${me.display_name}` : (me.id ? `@${me.id}` : "");
  track("authed");

  const playlists = await getMyPlaylists();
  // alphabetical sort
  playlists.sort((a, b) =>
    (a.name ?? "").localeCompare((b.name ?? ""), "es", { sensitivity: "base" })
  );

  playlistSelect.innerHTML =
    `<option value="">(select one)</option>` +
    playlists.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${p.tracks?.total ?? 0})</option>`).join("");

  track("playlists_loaded", { count: playlists.length });
  loadBtn.disabled = false;
  setStatus("Pick a playlist and load tracks.");

  loadBtn.addEventListener("click", async () => {
    const pid = playlistSelect.value;
    if (!pid) return;

    currentPlaylistId = pid;
    setStatus("Loading tracks…");
    track("playlist_load", { playlist_id: pid });

    const tracks = await getPlaylistTracks(pid);
    currentRows = tracks.map((t) => ({ track: t }));

    // Default sort: popularity desc
    applyStandardSort("popularity", "desc");

    intelligentBtn.disabled = false;
    randomBtn.disabled = false;
    saveBtn.disabled = false;
    overwriteBtn.disabled = false;

    track("playlist_tracks_loaded", { playlist_id: pid, count: tracks.length });
    setStatus("Loaded. Click headers to sort, or use Intelligent / Random sort, then save to Spotify.");
  });

  intelligentBtn.addEventListener("click", applyIntelligentSort);
  randomBtn.addEventListener("click", applyRandomSort);
  saveBtn.addEventListener("click", saveAsNewPlaylist);
  overwriteBtn.addEventListener("click", overwritePlaylist);
}

init().catch((e) => {
  console.error(e);
  track("app_error", { message: String(e?.message ?? e) });
  setStatus(`Error: ${escapeHtml(e?.message ?? String(e))}`);
});
