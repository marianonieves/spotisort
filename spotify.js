import { refreshIfNeeded } from "./auth.js";

const API = "https://api.spotify.com/v1";

export async function spotifyFetch(path, opts = {}) {
  const t = await refreshIfNeeded();
  if (!t?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${t.access_token}`,
      "Content-Type": "application/json",
    },
  });

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

  return res.json();
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

export async function getPlaylistTracks(playlistId) {
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

export async function createPlaylist(userId, { name, description = "", isPublic = false }) {
  return spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      public: isPublic,
    }),
  });
}

export async function addItemsToPlaylist(playlistId, uris) {
  // uris: array de spotify:track:...
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });
}

export async function replacePlaylistItems(playlistId, uris) {
  // reemplaza el contenido/orden (máx 100) :contentReference[oaicite:4]{index=4}
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: "PUT",
    body: JSON.stringify({ uris }),
  });
}
