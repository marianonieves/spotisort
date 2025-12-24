// Spotify
export const SPOTIFY_CLIENT_ID = "138161381bb34742b05c25c5a82fdc59";

export const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  // Needed to save a new sorted playlist (or overwrite an existing one)
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

// Google Analytics 4 (optional). Example: "G-XXXXXXXXXX". Leave empty to disable.
export const GA_MEASUREMENT_ID = "G-7ML56F0E8Q";

export function getRedirectUri() {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/[^/]*$/, "/callback.html");
  url.search = "";
  url.hash = "";
  return url.toString();
}
