import { createContext, useSyncExternalStore } from "react";

// useBandTone — how the status band draws: "light" (a white card, the
// default) or "dark" (the brand panel it was first built as).
//
// Dark is a developer switch for now: Billing Settings › Developer, a tab
// that only exists in a dev build. The choice lives in this browser's
// localStorage, and a production build ignores it, so whatever a developer
// left stored, everyone else gets the light band.

const KEY = "asia.dev.statusBandTone";
// Same-tab updates; the `storage` event covers other tabs.
const EVENT = "asia:band-tone";

function read() {
  if (!import.meta.env.DEV) return "light";
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    // Storage blocked (private window, cleared site data): the default.
    return "light";
  }
}

function subscribe(onChange) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setBandTone(tone) {
  try {
    if (tone === "dark") localStorage.setItem(KEY, "dark");
    else localStorage.removeItem(KEY);
  } catch {
    // Nowhere to keep it; the band stays light.
  }
  window.dispatchEvent(new Event(EVENT));
}

export default function useBandTone() {
  return useSyncExternalStore(subscribe, read, () => "light");
}

// The tone of the band a control is sitting in, so the school year menu in a
// band's corner matches it without each page passing the tone twice.
export const BandToneContext = createContext("light");
