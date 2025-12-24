# Spoti Sort

Spoti Sort is a **static** (HTML + JavaScript) tool that helps **playlist curators** keep their Spotify playlists fresh by reordering tracks (e.g., by popularity) and saving the new order back to Spotify.

- ✅ Authorization Code + PKCE (no backend)
- ✅ Works on **GitHub Pages**
- ✅ Sort by Popularity (toggle asc/desc)
- ✅ Smart Sort v2 (hook-first + no-repeat-artist + interleaving)
- ✅ Random Sort
- ✅ Reset to original order
- ✅ Save as **New** playlist or **Overwrite** original order
- ✅ GA4 tracking (via gtag.js) + GTM container (optional)

---

## Quick Links

- **URL (Prod):** https://marianonieves.github.io/spotisort/
- **Repo:** https://github.com/marianonieves/spotisort
- **Spotify Dashboard (Client ID: 138161381bb34742b05c25c5a82fdc59):**
  https://developer.spotify.com/dashboard/138161381bb34742b05c25c5a82fdc59
- **Spotify Playlists docs:** https://developer.spotify.com/documentation/web-api/concepts/playlists
- **Google Tag Manager (Workspace):** https://tagmanager.google.com/?hl=es#/container/accounts/6330102113/containers/238573826/workspaces/2
- **Spotify Community post:** https://community.spotify.com/t5/Music-Exchange/Playlist-Tools-Sort/m-p/7276306#M110034

---

## Spotify App Setup

1) Create an app: https://developer.spotify.com/dashboard  
2) Copy the **Client ID** to `config.js`  
3) Add Redirect URIs (exact match):
- Prod: `https://marianonieves.github.io/spotisort/callback.html`
- Local: `http://localhost:5173/callback.html` (or your local dev URL)

Required scopes (minimum for this app):
- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`
- `playlist-modify-public`

---

## Deploy (GitHub Pages)

- Push to `main`
- GitHub → Settings → Pages → Deploy from branch → `main` / `/root`

---

## Analytics (GA4) — Events tracked

This build sends events using:
- `gtag('event', ...)` (GA4)
- `dataLayer.push(...)` (GTM, optional)

### Funnel events (Sign-in → Use → Save)
| Event | When it fires | Key params |
|---|---|---|
| `login_click` | User clicks “Login with Spotify” | |
| `auth_success` | Callback succeeded (token obtained) | |
| `auth_error` | Callback failed | `error` |
| `login_success` | User profile loaded | |
| `playlists_loaded` | Playlists list loaded | `playlists_count` |
| `playlist_selected` | User chooses playlist in dropdown | `playlist_id` |
| `tracks_load_start` | Track loading begins | `playlist_id` |
| `tracks_loaded` | Tracks fully loaded | `playlist_id`, `tracks_count`, `playlist_tracks_total` |

### Sorting usage
| Event | When it fires | Key params |
|---|---|---|
| `sort_by_popularity_click` | User clicks “Sort by Popularity” button | |
| `sort_column` | User sorts by a table column header | `field`, `dir`, `playlist_id` |
| `smart_sort_v2` | Smart Sort button clicked | |
| `random_sort` | Random Sort clicked | `tracks` |
| `reset_order` | Reset clicked | |
| `sort_applied` | Any sort applied (single consolidated event) | `sort_type`, `sort_field`, `sort_dir` |

### Saving to Spotify
| Event | When it fires | Key params |
|---|---|---|
| `save_click` | User clicks Save (New / Overwrite) | `mode`, `playlist_id` |
| `save_start` | Save starts | `mode`, `playlist_id`, `tracks_count` |
| `save_success` | Save completed | `mode`, `playlist_id`, `tracks_count` |
| `overwrite_cancel` | User cancels overwrite confirmation | `playlist_id` |

### Drop-off / time
| Event | When it fires | Key params |
|---|---|---|
| `abandon_after_sort` | User leaves after sorting but without saving (best effort) | `playlist_id`, `tracks_count`, `last_sort_type` |
| `session_end` | Pagehide (best effort) | `duration_ms`, `had_sort`, `had_save`, `last_sort_type`, `save_mode` |

---

## How to answer key product questions (in GA4)

- **How many users sort but do NOT save?**  
  Use `abandon_after_sort` event count, OR build a segment: users with `sort_applied` and without `save_success` (same session view is best-effort).

- **New playlist vs Overwrite preference**  
  Report on `save_success` grouped by parameter `mode` (`new` vs `overwrite`).  
  You can also compare attempts using `save_click`.

- **Time on site**  
  Use GA4 engagement metrics (e.g. Average engagement time per session).  
  Optionally, `session_end.duration_ms` is available as a custom metric.

---

## Dev notes
- Playlist items are paginated (reads in pages), and saves are chunked to respect Spotify API limits.
- Smart Sort v2 is designed to frontload stronger “hooks” while avoiding repeating the same primary artist back-to-back.
