// 1) Creá una app en https://developer.spotify.com/dashboard
// 2) Copiá tu Client ID acá (NO es secreto, es seguro para frontend)
// 3) Agregá Redirect URIs (exact match):
//    - https://TUUSUARIO.github.io/TUREPO/callback.html
//    - http://127.0.0.1:5173/callback.html (o el puerto que uses)
export const SPOTIFY_CLIENT_ID = "PONÉ_ACÁ_TU_CLIENT_ID";

export const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export function getRedirectUri() {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/[^/]*$/, "/callback.html");
  url.search = "";
  url.hash = "";
  return url.toString();
}
