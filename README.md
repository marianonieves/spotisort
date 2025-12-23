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
