// Build: 2025-12-24T13:18Z ga4-events-v2-fixed
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
  // Send to dataLayer (GTM) if present
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });

  // Send to GA4 (gtag.js) if present
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
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

let isLoadingTracks = false;

// --- Analytics session helpers ---
let sessionStartTs = Date.now();
let hasSortedInSession = false;
let hasSavedInSession = false;
let lastSortMeta = { sort_type: "", sort_field: "", sort_dir: "" };
let lastSaveMode = "";

function markSorted(meta = {}) {
  hasSortedInSession = true;
  lastSortMeta = {
    sort_type: meta.sort_type || lastSortMeta.sort_type || "",
    sort_field: meta.sort_field || lastSortMeta.sort_field || "",
    sort_dir: meta.sort_dir || lastSortMeta.sort_dir || "",
  };
}

function markSaved(mode) {
  hasSavedInSession = true;
  if (mode) lastSaveMode = mode;
}

function trackAbandonIfNeeded() {
  // Fire a lightweight event if user sorted but didn't save in this session
  if (hasSortedInSession && !hasSavedInSession && currentPlaylist?.id) {
    trackEvent("abandon_after_sort", {
      playlist_id: currentPlaylist.id,
      tracks_count: currentRows?.length ?? 0,
      last_sort_type: lastSortMeta.sort_type || "",
      last_sort_field: lastSortMeta.sort_field || "",
      last_sort_dir: lastSortMeta.sort_dir || "",
    });
  }

  // Optional: explicit session duration (GA4 also provides engagement time automatically)
  const duration_ms = Date.now() - sessionStartTs;
  trackEvent("session_end", {
    duration_ms,
    had_sort: hasSortedInSession ? 1 : 0,
    had_save: hasSavedInSession ? 1 : 0,
    last_sort_type: lastSortMeta.sort_type || "",
    save_mode: lastSaveMode || "",
  });
}

const sortState = {
  field: null,
  dir: "desc", // 'asc' | 'desc'
};

function setStatus(msg) {
  const text = (msg ?? "").toString();
  statusEl.textContent = text;

  const hasText = !!text.trim();
  statusEl.classList.toggle("status--visible", hasText);

  // Consider it "busy" when it looks like a long-running action (loading/saving/etc)
  const busy =
    /loading|saving|fetching|sorting|authorizing|updating/i.test(text) ||
    /…|\.\.\./.test(text);
  statusEl.classList.toggle("status--busy", hasText && busy);
  statusEl.setAttribute("aria-busy", (hasText && busy) ? "true" : "false");
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

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function primaryArtistKey(track) {
  const a0 = track?.artists?.[0];
  return a0?.id || a0?.name || "unknown";
}

function smartScore(track) {
  const pop = (track?.popularity ?? 0) / 100; // 0..1
  const durNorm = clamp01((track?.duration_ms ?? 0) / 240000); // 4min = 1
  return 0.75 * pop + 0.25 * (1 - durNorm);
}

function splitBuckets(sortedRows) {
  const n = sortedRows.length;
  const aEnd = Math.ceil(n * 0.2);
  const cStart = Math.floor(n * 0.8);
  return {
    A: sortedRows.slice(0, aEnd),
    B: sortedRows.slice(aEnd, cStart),
    C: sortedRows.slice(cStart),
  };
}

function pickWithCooldown(bucket, recentArtistKeys) {
  for (let i = 0; i < bucket.length; i++) {
    const row = bucket[i];
    if (!recentArtistKeys.includes(row.__artistKey)) {
      bucket.splice(i, 1);
      return row;
    }
  }
  return null;
}

function smartSortV2(rows, { hookN = 5, cooldown = 2, pattern = ["A", "A", "B", "A", "B", "C"] } = {}) {
  const base = rows.filter((r) => r?.track?.id);

  const ranked = base
    .map((row, idx) => ({
      ...row,
      __index: idx + 1, // original order index (for Reset)
      __artistKey: primaryArtistKey(row.track),
      __score: smartScore(row.track),
    }))
    .sort((a, b) => b.__score - a.__score);

  const buckets = splitBuckets(ranked);

  const out = [];
  const recent = [];
  const pushRecent = (key) => {
    recent.push(key);
    while (recent.length > cooldown) recent.shift();
  };

  const total = ranked.length;
  let step = 0;

  // Hook-first: prioritize A, fallback B, then C
  for (let i = 0; i < Math.min(hookN, total); i++) {
    let row =
      pickWithCooldown(buckets.A, recent) ||
      pickWithCooldown(buckets.B, recent) ||
      pickWithCooldown(buckets.C, recent) ||
      (buckets.A.shift() || buckets.B.shift() || buckets.C.shift());

    if (!row) break;
    out.push(row);
    pushRecent(row.__artistKey);
  }

  // Interleaving for the rest
  while (out.length < total) {
    const tier = pattern[step % pattern.length];
    step++;

    let row =
      pickWithCooldown(buckets[tier], recent) ||
      pickWithCooldown(buckets.A, recent) ||
      pickWithCooldown(buckets.B, recent) ||
      pickWithCooldown(buckets.C, recent) ||
      (buckets.A.shift() || buckets.B.shift() || buckets.C.shift());

    if (!row) break;
    out.push(row);
    pushRecent(row.__artistKey);
  }

  return out;
}

function applyIntelligentSort() {
  // Smart Sort v2: Hook-first + no-repeat-artist + interleaving
  trackEvent("smart_sort_v2");

      trackEvent("sort_applied", { sort_type: "smart_sort_v2" });
  markSorted({ sort_type: "smart_sort_v2" });
sortState.field = "__smart__"; // custom sort (clears header arrows)
  sortState.dir = "desc";

  const sorted = smartSortV2(currentRows, {
    hookN: 5,
    cooldown: 2,
    pattern: ["A", "A", "B", "A", "B", "C"],
  });

  visibleRows = sorted;
  renderTable(visibleRows);
  setActiveHeader();

  // Backward-compatible event name
  trackEvent("intelligent_sort");
      trackEvent("sort_applied", { sort_type: "intelligent_sort" });
setStatus("Smart Sort applied. You can Save it to Spotify.");
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
    trackEvent("sort_applied", { sort_type: "random_sort" });
  markSorted({ sort_type: "random_sort" });
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

      lastSaveMode = "new";
  trackEvent("save_click", { mode: "new", playlist_id: currentPlaylist?.id ?? "" });
  trackEvent("save_start", { mode: "new", playlist_id: currentPlaylist?.id ?? "", tracks_count: currentRows?.length ?? 0 });
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
    trackEvent("save_success", { mode: "new", playlist_id: currentPlaylist?.id ?? "", tracks_count: currentRows?.length ?? 0 });
  markSaved("new");
}

async function overwriteCurrentPlaylist() {
  if (!currentPlaylist?.id) throw new Error("Pick a playlist first");

  const uris = getSortedTrackUris();
  if (!uris.length) throw new Error("No tracks loaded");

  // Safety confirmation without a modal (keeps it static + simple)
  const ok = window.confirm(
    `Overwrite "${currentPlaylist.name}" on Spotify?\n\nThis will replace the track order in the selected playlist.`
  );
  if (!ok) {
    trackEvent("overwrite_cancel", { playlist_id: currentPlaylist.id });
    return;
  }

  setSaveStatus("Overwriting playlist order…");
  trackEvent("overwrite_start", { playlist_id: currentPlaylist.id, tracks: uris.length });

      lastSaveMode = "overwrite";
  trackEvent("save_click", { mode: "overwrite", playlist_id: currentPlaylist?.id ?? "" });
  trackEvent("save_start", { mode: "overwrite", playlist_id: currentPlaylist?.id ?? "", tracks_count: currentRows?.length ?? 0 });
await overwritePlaylistItems(currentPlaylist.id, uris);

  const url = `https://open.spotify.com/playlist/${currentPlaylist.id}`;
  setSaveStatus(
    `Done ✅ Playlist updated. <a href="${url}" target="_blank" rel="noreferrer">Open it on Spotify</a>`,
    { html: true }
  );

  trackEvent("overwrite_done", { playlist_id: currentPlaylist.id, tracks: uris.length });
    trackEvent("save_success", { mode: "overwrite", playlist_id: currentPlaylist?.id ?? "", tracks_count: currentRows?.length ?? 0 });
  markSaved("overwrite");
}

async function init() {

  // Track session end / abandon-after-sort (best effort) when leaving the page
  window.addEventListener("pagehide", () => {
    try {
      trackAbandonIfNeeded();
    } catch (_) {}
  });
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
    trackEvent("sort_applied", { sort_type: "popularity", sort_dir: sortState.dir });
    markSorted({ sort_type: "popularity", sort_dir: sortState.dir });
    setStatus(`Sorted by Popularity (${sortState.dir === "desc" ? "desc" : "asc"}). Now you can save it to Spotify.`);
  };


  intelligentBtn.onclick = () => applyIntelligentSort();
  randomBtn.onclick = () => applyRandomSort();

  resetBtn.onclick = () => {
    // Restore original playlist order (as returned by Spotify)
    trackEvent("reset_order");
        trackEvent("sort_applied", { sort_type: "reset" });
    markSorted({ sort_type: "reset" });
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
    trackEvent("sort_applied", { sort_type: "column", sort_field: field, sort_dir: sortState.dir });
    markSorted({ sort_type: "column", sort_field: field, sort_dir: sortState.dir });

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

  trackEvent("login_success");
  trackEvent("playlists_loaded", { playlists_count: playlists.length });
  playlists.sort((a, b) => (a?.name ?? "").localeCompare((b?.name ?? ""), undefined, { sensitivity: "base" }));

  playlistSelect.innerHTML =
    `<option value="">Select a playlist…</option>` +
    playlists.map(p => `<option value="${p.id}" data-tracks="${p.tracks?.total ?? 0}">${p.name} (${p.tracks?.total ?? 0})</option>`).join("");

  loadBtn.disabled = false;
  exportBtn.disabled = true;
  saveBtn.disabled = true;
  overwriteBtn.disabled = true;
  intelligentBtn.disabled = true;
  randomBtn.disabled = true;

  loadBtn.onclick = async () => {
    const pid = playlistSelect.value;
    if (!pid) return;

    // Prevent duplicate clicks / concurrent loads
    if (isLoadingTracks) return;
    isLoadingTracks = true;

    const prevLoadText = loadBtn.textContent;
    loadBtn.textContent = "Loading…";

    // Disable controls while loading to avoid repeated calls
    loadBtn.disabled = true;
    playlistSelect.disabled = true;
    sortPlaylistBtn.disabled = true;
    intelligentBtn.disabled = true;
    randomBtn.disabled = true;
    resetBtn.disabled = true;
    exportBtn.disabled = true;
    saveBtn.disabled = true;
    overwriteBtn.disabled = true;

    featuresWarning.textContent = "";
    setSaveStatus("");
    tbody.innerHTML = "";
    stats.textContent = "";

    const selectedName = playlistSelect.options[playlistSelect.selectedIndex]?.textContent ?? "";
    currentPlaylist = { id: pid, name: selectedName.replace(/\s*\(\d+\)\s*$/, "") };


    const tracksTotal = Number(playlistSelect.options[playlistSelect.selectedIndex]?.dataset?.tracks ?? 0);

    // Funnel / product tracking
    trackEvent("playlist_selected", { playlist_id: pid, playlist_tracks_total: tracksTotal });
    trackEvent("tracks_load_start", { playlist_id: pid, playlist_tracks_total: tracksTotal });

    try {
      setStatus("Loading tracks…");

      const tracks = await getPlaylistTracks(pid, {
        onProgress: ({ loaded, total }) => {
          if (total) setStatus(`Loading tracks… ${loaded}/${total}`);
          else setStatus(`Loading tracks… ${loaded}`);
        },
      });

      currentRows = tracks.map((t) => ({ track: t }));

      // Keep user's order by default (unless a sort is active)
      applySort();

      setStatus("Ready.");
      exportBtn.disabled = false;
      saveBtn.disabled = false;
      overwriteBtn.disabled = false;
      intelligentBtn.disabled = false;
      randomBtn.disabled = false;
      sortPlaylistBtn.disabled = false;
      resetBtn.disabled = false;

      trackEvent("tracks_loaded", {
        playlist_id: pid,
        tracks_count: currentRows.length,
        playlist_tracks_total: tracksTotal,
      });

      // Backward-compatible event name (legacy)
      trackEvent("playlist_loaded", {
        playlist_id: pid,
        tracks: currentRows.length,
        tracks_count: currentRows.length,
        playlist_tracks_total: tracksTotal,
      });
} catch (e) {
      console.error(e);
      trackEvent("tracks_load_error", { playlist_id: pid, message: String(e?.message ?? e) });
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      isLoadingTracks = false;
      loadBtn.textContent = prevLoadText;
      playlistSelect.disabled = false;
      loadBtn.disabled = false;

      const hasTracks = Array.isArray(currentRows) && currentRows.length > 0;
      if (!hasTracks) {
        sortPlaylistBtn.disabled = true;
        intelligentBtn.disabled = true;
        randomBtn.disabled = true;
        resetBtn.disabled = true;
        exportBtn.disabled = true;
        saveBtn.disabled = true;
        overwriteBtn.disabled = true;
      }
    }
  };
      loadBtn.textContent = prevLoadText;
      playlistSelect.disabled = false;
      // loadBtn.disabled will be re-enabled below based on state
      loadBtn.disabled = false;

      // Re-evaluate button states after load
      const hasTracks = Array.isArray(currentRows) && currentRows.length > 0;
      sortPlaylistBtn.disabled = !hasTracks;
      intelligentBtn.disabled = !hasTracks;
      randomBtn.disabled = !hasTracks;
      resetBtn.disabled = !hasTracks;
      exportBtn.disabled = !hasTracks;
      saveBtn.disabled = !hasTracks;
      overwriteBtn.disabled = !hasTracks;
    }
  }

init().catch((e) => {
  console.error(e);
  trackEvent("tracks_load_error", { playlist_id: pid, message: String(e?.message ?? e) });
      setStatus("Error: " + (e?.message ?? String(e)));
});