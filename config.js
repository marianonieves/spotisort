// Spoti Sort config
// Client ID (safe to expose on frontend).
// Make sure your Spotify app has this Redirect URI (exact match):
//   https://marianonieves.github.io/spotisort/callback.html
export const SPOTIFY_CLIENT_ID = "138161381bb34742b05c25c5a82fdc59";

// OAuth scopes needed for reading + saving playlists
export const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export function getRedirectUri() {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/[^/]*$/, "/callback.html");
  url.search = "";
  url.hash = "";
  return url.toString();
}
