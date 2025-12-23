import { SPOTIFY_CLIENT_ID, SCOPES, getRedirectUri } from "./config.js";

const LS = {
  codeVerifier: "sp_code_verifier",
  state: "sp_state",
  token: "sp_token",
};

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(plain) {
  const enc = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return new Uint8Array(digest);
}

export async function login() {
  const codeVerifier = randomString(64);
  const state = randomString(16);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64url(hashed);

  localStorage.setItem(LS.codeVerifier, codeVerifier);
  localStorage.setItem(LS.state, state);

  const redirectUri = getRedirectUri();
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  }).toString();

  window.location.href = authUrl.toString();
}

export function logout() {
  localStorage.removeItem(LS.codeVerifier);
  localStorage.removeItem(LS.state);
  localStorage.removeItem(LS.token);
}

export function getToken() {
  const raw = localStorage.getItem(LS.token);
  return raw ? JSON.parse(raw) : null;
}

function setToken(tokenObj) {
  localStorage.setItem(LS.token, JSON.stringify(tokenObj));
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) throw new Error(error);
  if (!code) throw new Error("No code in callback URL.");

  const expectedState = localStorage.getItem(LS.state);
  if (!expectedState || state !== expectedState) {
    throw new Error("Invalid state (CSRF check failed).");
  }

  const codeVerifier = localStorage.getItem(LS.codeVerifier);
  if (!codeVerifier) throw new Error("Missing code_verifier.");

  const redirectUri = getRedirectUri();

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? "Token exchange failed");

  const expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;
  setToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  });

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);
}

export async function refreshIfNeeded() {
  const t = getToken();
  if (!t?.refresh_token) return t;
  if (t.expires_at && Date.now() < t.expires_at) return t;

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? "Token refresh failed");

  const expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;
  const next = {
    access_token: data.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiresAt,
  };
  setToken(next);
  return next;
}
