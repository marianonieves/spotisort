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

SMART SORT V2
Parámetros (defaults razonables)

hookN = 5 → los primeros 5 bien “fáciles” (popular + cortos)

cooldown = 2 → no repetir artista dentro de las últimas 2 canciones

Buckets por score:

A = top 20%, B = middle 60%, C = bottom 20%

Patrón interleaving: A, A, B, A, B, C (repetido)

Score base (igual a tu idea, pero normalizado):

score = 0.75*(popularity/100) + 0.25*(1 - clamp(duration_ms/240000))

POR QUÉ ESTE APPROACH SUELE MEJORAR ENGAGEMENT

Hook-first: reduce la probabilidad de que el usuario abandone temprano (skips y cambios de canción pasan muy pronto y son muy frecuentes). 
PMC
+2
Spotify Research
+2

No repetir artista: evita “fatiga” y mantiene sensación de variedad (práctica común en curación). 
ZIPDJ | The World's Best DJ Pool
+1

Interleaving: evita que la playlist se vuelva “plana” (todo hits) o que se hunda con varios tracks flojos seguidos.

## 7) Google Analytics (GA4) (opcional)
1. En Google Analytics: Admin → Create Property → Data Streams → Web.
2. Copiá el **Measurement ID** (formato `G-XXXXXXXXXX`).
3. Pegalo en `config.js` como `GA_MEASUREMENT_ID = "G-..."`.
4. Deploy: al cargar el sitio, se inyecta automáticamente `gtag.js` (sin backend).


## Metrics (GTM)
This build includes Google Tag Manager container GTM-N7H26368 in index.html and callback.html.
Create GA4 tags/events inside GTM.
