// Build: 2025-12-24T13:18Z ga4-events-v2-fixed
import { GA_MEASUREMENT_ID } from "./config.js";

let ready = false;
let pending = [];

/**
 * Initializes GA4 on demand. No-op if GA_MEASUREMENT_ID is empty.
 * Works on GitHub Pages (static).
 */
export function initAnalytics() {
  const id = (GA_MEASUREMENT_ID || "").trim();
  if (!id) return;

  // Avoid double-initialization
  if (ready || document.getElementById("ga4-gtag")) return;

  // Inject gtag.js
  const s = document.createElement("script");
  s.async = true;
  s.id = "ga4-gtag";
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  // Create stub
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  window.gtag("js", new Date());
  window.gtag("config", id, { anonymize_ip: true });

  ready = true;
  // Flush anything we queued before init
  for (const ev of pending) window.gtag(...ev);
  pending = [];
}

/**
 * Safe event helper. If GA isn't configured, it's a no-op.
 */
export function trackEvent(name, params = {}) {
  const id = (GA_MEASUREMENT_ID || "").trim();
  if (!id) return;

  const payload = ["event", name, params];
  if (typeof window.gtag === "function") {
    window.gtag(...payload);
  } else {
    pending.push(payload);
  }
}

// Auto-init when module is loaded (safe if GA_MEASUREMENT_ID is empty).
initAnalytics();
