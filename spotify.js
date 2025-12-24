import { refreshIfNeeded } from "./auth.js";

const API = "https://api.spotify.com/v1";

export async function spotifyFetch(path, opts = {}) {
  const t = await refreshIfNeeded();
  if (!t?.access_token) throw new Error("Not authenticated");

  const maxRetries = 5;
  let attempt = 0;
  let backoffMs = 750;

  while (true) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
          ...(opts.headers ?? {}),
          Authorization: `Bearer ${t.access_token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      // Network error — retry with backoff a few times
      if (attempt >= maxRetries) throw e;
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoffMs + jitter));
      attempt++;
      backoffMs = Math.min(backoffMs * 2, 15000);
      continue;
    }

    // Rate limited — respect Retry-After if exposed; otherwise fall back to backoff
    if (res.status === 429) {
      if (attempt >= maxRetries) {
        const err = new Error("Rate limited (429). Please try again in a moment.");
        err.status = 429;
        throw err;
      }

      const ra = res.headers?.get?.("Retry-After");
      let waitMs = Number.isFinite(parseInt(ra, 10)) ? parseInt(ra, 10) * 1000 : backoffMs;

      // Safety: sometimes Retry-After can be missing/0 or very large; clamp + jitter
      waitMs = Math.max(1000, Math.min(waitMs, 30000));
      const jitter = Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, waitMs + jitter));

      attempt++;
      backoffMs = Math.min(backoffMs * 2, 30000);
      continue;
    }

    // Transient server errors — retry a few times
    if ([500, 502, 503, 504].includes(res.status)) {
      if (attempt >= maxRetries) {
        let msg = `${res.status} ${res.statusText}`;
        try {
          const data = await res.json();
          msg = data?.error?.message ?? msg;
        } catch {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }

      const jitter = Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, backoffMs + jitter));
      attempt++;
      backoffMs = Math.min(backoffMs * 2, 15000);
      continue;
    }

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        msg = data?.error?.message ?? msg;
      } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    // Some endpoints may return 204 No Content
    if (res.status === 204) return null;

    return res.json();
  }
}


export async function getMe() {
  return spotifyFetch("/me");
}

export async function getMyPlaylists() {
  const out = [];
  let url = "/me/playlists?limit=50";
  while (url) {
    const page = await spotifyFetch(url);
    out.push(...page.items);
    url = page.next ? page.next.replace(API, "") : null;
  }
  return out;
}

export async function getPlaylistTracks(playlistId, { onProgress } = {}) {
  const tracks = [];
  let url = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&fields=items(track(id,name,artists(name),duration_ms,popularity,external_urls(spotify))),next,total`;
  while (url) {
    const page = await spotifyFetch(url);
    for (const it of page.items) {
      if (it?.track?.id) tracks.push(it.track);
    }
    url = page.next ? page.next.replace(API, "") : null;
  }
  return tracks;
}

export async function createPlaylist(userId, name, { description = "Sorted with Spoti Sort", isPublic = false } = {}) {
  return spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      public: Boolean(isPublic),
    }),
  });
}

// Add tracks to a playlist (max 100 URIs per request)
export async function addPlaylistItems(playlistId, trackUris) {
  const chunks = [];
  for (let i = 0; i < trackUris.length; i += 100) chunks.push(trackUris.slice(i, i + 100));

  for (const chunk of chunks) {
    await spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    });
  }
}

// Overwrite a playlist's items with new order (Spotify replaces first 100, then you append the rest)
export async function overwritePlaylistItems(playlistId, trackUris) {
  const first = trackUris.slice(0, 100);
  const rest = trackUris.slice(100);

  await spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: "PUT",
    body: JSON.stringify({ uris: first }),
  });

  if (rest.length) {
    await addPlaylistItems(playlistId, rest);
  }
}

// Audio Features (máx 100 ids por request)
export async function getAudioFeatures(trackIds) {
  const chunks = [];
  for (let i = 0; i < trackIds.length; i += 100) chunks.push(trackIds.slice(i, i + 100));

  const featuresById = new Map();
  for (const chunk of chunks) {
    const qs = new URLSearchParams({ ids: chunk.join(",") }).toString();
    const data = await spotifyFetch(`/audio-features?${qs}`);
    for (const f of (data.audio_features ?? [])) {
      if (f?.id) featuresById.set(f.id, f);
    }
  }
  return featuresById;
}
