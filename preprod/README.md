# Spotify Playlist Sorter (Static, GitHub Pages)

Una mini-app estática (HTML + JavaScript) que:
- Autentica con Spotify usando Authorization Code + PKCE
- Lista tus playlists
- Carga tracks de una playlist
- (Si tu app tiene acceso) busca Audio Features para ordenar/filtrar por BPM/energy/loudness, etc.
- Exporta CSV

> Nota: Spotify restringió Audio Features para apps nuevas (puede devolver 403). En ese caso, podés ordenar por metadata estándar.

## 1) Configuración en Spotify Dashboard
1. Crear una app en: https://developer.spotify.com/dashboard
2. Copiar el **Client ID** en `config.js`
3. Agregar Redirect URIs (exact match):
   - Producción: `https://TUUSUARIO.github.io/TUREPO/callback.html`
   - Local (recomendado): `http://127.0.0.1:5173/callback.html`

## 2) Deploy en GitHub Pages
- Settings → Pages → Deploy from a branch → Branch: `main` / folder: `/root`
- Entrar a: `https://TUUSUARIO.github.io/TUREPO/`

## 3) Dev local
Usá un server local (el redirect debe usar 127.0.0.1):
- Vite: `npm run dev -- --host 127.0.0.1 --port 5173`
- Python: `python3 -m http.server 8080 --bind 127.0.0.1` (y registrás `http://127.0.0.1:8080/callback.html`)

## 4) Troubleshooting
- Si falla el login: revisá que el Redirect URI matchee exacto y sea HTTPS en GitHub Pages.
- Si ves el warning de 403: tu app no tiene acceso a Audio Features.


## 5) Guardar playlists (nuevo o overwrite)
- **Save sorted playlist to Spotify**: crea una playlist nueva (privada) con el orden aplicado.
- **Overwrite current playlist**: reemplaza el orden de la playlist seleccionada.

En ambos casos vas a ver un link **Open it on Spotify** en el mensaje de confirmación.

## 6) Intelligent Sort / Random Sort
- **Intelligent Sort**: ordena por *popularity desc* y, ante empate, por *duration asc*.
- **Random Sort**: mezcla (shuffle) el orden.

## 7) Google Analytics (GA4) (opcional)
1. En Google Analytics: Admin → Create Property → Data Streams → Web.
2. Copiá el **Measurement ID** (formato `G-XXXXXXXXXX`).
3. Pegalo en `config.js` como `GA_MEASUREMENT_ID = "G-..."`.
4. Deploy: al cargar el sitio, se inyecta automáticamente `gtag.js` (sin backend).


## Metrics (GTM)
This build includes Google Tag Manager container GTM-N7H26368 in index.html and callback.html.
Create GA4 tags/events inside GTM.


## Quick Links
- URL: https://marianonieves.github.io/spotisort/
- Repo: https://github.com/marianonieves/spotisort
- Spotify Dashboard (Client ID: 138161381bb34742b05c25c5a82fdc59): https://developer.spotify.com/dashboard/138161381bb34742b05c25c5a82fdc59
- Spotify Web API — Playlists: https://developer.spotify.com/documentation/web-api/concepts/playlists
- Google Tag Manager (GTM): https://tagmanager.google.com/?hl=es#/container/accounts/6330102113/containers/238573826/workspaces/2
- Google Analytics 4 (GA4): https://tagmanager.google.com/?hl=es#/container/accounts/6330102113/containers/238573826/workspaces/2
- Spotify Community Post: https://community.spotify.com/t5/Music-Exchange/Playlist-Tools-Sort/m-p/7276306#M110034

## Analytics (GA4)
This app supports GA4 via `gtag.js` and custom product events.

### Config
Set your Measurement ID in `config.js`:
- `GA_MEASUREMENT_ID = "G-7ML56F0E8Q"`

### Events tracked (custom)
Core funnel and usage events (all are sent both to `dataLayer` and to GA4):
- `login_click`
- `auth_success`, `auth_error`
- `playlists_loaded` (`playlists_count`)
- `playlist_selected` (`playlist_id`, `tracks_total`)
- `tracks_load_start` (`playlist_id`)
- `tracks_loaded` (`playlist_id`, `tracks_count`)
- `playlist_loaded` (legacy, includes `tracks_count`)
- `sort_by_popularity_click`
- `sort_column` (`field`, `dir`)
- `smart_sort_v2`, `intelligent_sort` (legacy)
- `random_sort`
- `reset_order`
- `sort_applied` (`sort_type`, optional `sort_field`, `sort_dir`)
- `save_click` (`save_mode`: `new|overwrite`)
- `save_new_start`, `save_new_done` (legacy)
- `overwrite_start`, `overwrite_done` (legacy)
- `save_success` (`save_mode`, `tracks_count`, `playlist_id`)
- `overwrite_cancel`
- `session_summary` (`duration_ms`, `had_sort`, `had_save`, `last_sort_*`, counts)
- `abandon_after_sort` (derived when `had_sort=1` and `had_save=0`)

### GA4 reporting tips
- Use **Explore → Funnel exploration** with: `login_click → auth_success → tracks_loaded → sort_applied → save_success`
- To measure "sorted but not saved": use `abandon_after_sort` or filter `session_summary` where `had_sort=1` and `had_save=0`.

