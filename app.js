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

const $ = (id) => document.getElementById(id);

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const meEl = $("me");
const statusEl = $("status");
const appSection = $("appSection");
const playlistSelect = $("playlistSelect");
const loadBtn = $("loadBtn");
const exportBtn = $("exportBtn");
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
  field: "popularity",
  dir: "desc", // 'asc' | 'desc'
};

function setStatus(msg) {
  statusEl.textContent = msg ?? "";
}

function setSaveStatus(msg) {
  saveStatus.textContent = msg ?? "";
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

  const suffix = `${sortState.field} ${sortState.dir}`;
  const name = `${currentPlaylist.name} (SpotiSort · ${suffix})`;

  setSaveStatus("Creating a new playlist…");
  const created = await createPlaylist(me.id, name, {
    description: "Sorted with Spoti Sort",
    isPublic: false,
  });

  setSaveStatus("Adding tracks…");
  await addPlaylistItems(created.id, uris);

  setSaveStatus("Done ✅ New playlist created.");
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
  await overwritePlaylistItems(currentPlaylist.id, uris);
  setSaveStatus("Done ✅ Playlist updated.");
}

async function init() {
  loginBtn.onclick = () => login();
  logoutBtn.onclick = () => { logout(); window.location.reload(); };
  exportBtn.onclick = () => exportCsv();
  saveBtn.onclick = () => saveAsNewPlaylist().catch(e => setSaveStatus(`Error: ${e?.message ?? String(e)}`));
  overwriteBtn.onclick = () => overwriteCurrentPlaylist().catch(e => setSaveStatus(`Error: ${e?.message ?? String(e)}`));

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
  setStatus("Loading your profile and playlists…");
  appSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  meEl.classList.remove("hidden");
  loginBtn.classList.add("hidden");

  me = await getMe();
  meEl.textContent = `Logged in as ${me.display_name ?? me.id ?? ""}`;

  const playlists = await getMyPlaylists();
  playlists.sort((a, b) => (a?.name ?? "").localeCompare((b?.name ?? ""), undefined, { sensitivity: "base" }));

  playlistSelect.innerHTML = `<option value="">Select a playlist…</option>` +
    playlists.map(p => `<option value="${p.id}">${p.name} (${p.tracks?.total ?? 0})</option>`).join("");

  loadBtn.disabled = false;
  exportBtn.disabled = true;
  saveBtn.disabled = true;
  overwriteBtn.disabled = true;

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

    // If you later get Audio Features access back, you can re-enable it here.
    // try { ... } catch (e) { ... }

    applySort();
    setStatus("Ready.");
    exportBtn.disabled = false;
    saveBtn.disabled = false;
    overwriteBtn.disabled = false;
  };

  setStatus("Ready.");
}

init().catch((e) => {
  console.error(e);
  setStatus("Error: " + (e?.message ?? String(e)));
});
