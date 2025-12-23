# Spoti Sort (Static GitHub Pages)

A simple, static web app (HTML + JS) that lets playlist curators:
- Login with Spotify (PKCE)
- Load a playlist
- Sort tracks by clicking table headers (Track, Artist, Popularity, Duration)
- Intelligent Sort (popularity ↓ then duration ↑)
- Random Sort
- Save the sorted order back to Spotify (new playlist or overwrite)

## Spotify configuration
Client ID is set in `config.js`.

Add this Redirect URI (exact match) in your Spotify app settings:
- https://marianonieves.github.io/spotisort/callback.html

## Google Tag Manager
This build includes GTM snippets in both `index.html` and `callback.html` with container:
- GTM-N7H26368

You can create GA4 tags inside GTM to measure pageviews/events.

## Deploy
Push these files to the repo root and enable GitHub Pages:
Settings → Pages → Deploy from a branch → main → /(root)
