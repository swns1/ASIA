import { createContext, useContext, useSyncExternalStore } from "react";
import useCurrentUser from "./useCurrentUser";
import { hasAnyRole, STAFF_ADMIN } from "../utils/auth";

// useTheme — light or dark.
//
// Dark mode is a development tool for now, not something staff can find. An
// admin picks Light, Dark or "Same as my computer" in Billing Settings ›
// Developer, a tab only a development build has, for super admins and admins.
// The choice is kept in this browser, and it only takes effect while a super
// admin or admin is signed in: anyone else, and every production build, gets
// light.
//
// The theme isn't set on the whole document. AppLayout sets `data-theme` on
// the sidebar, and on the page area only for pages already converted
// (constants/darkReady.js), so an unconverted page stays fully light rather
// than half dark. ThemeContext tells a component which of the two it sits in.

const KEY = "asia.dev.theme";
// The status band's own switch, which this replaced.
const OLD_BAND_KEY = "asia.dev.statusBandTone";
// Same-tab updates; the `storage` event covers other tabs.
const EVENT = "asia:theme";
const PREFERENCES = ["light", "dark", "system"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference() {
  if (!import.meta.env.DEV) return "light";
  try {
    const stored = localStorage.getItem(KEY);
    return PREFERENCES.includes(stored) ? stored : "light";
  } catch {
    // Storage blocked (private window, cleared site data): the default.
    return "light";
  }
}

function subscribePreference(onChange) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Saves the developer switch: "light", "dark" or "system". */
export function setThemePreference(preference) {
  try {
    if (preference === "dark" || preference === "system") localStorage.setItem(KEY, preference);
    else localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_BAND_KEY);
  } catch {
    // Nowhere to keep it; the app stays light.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The developer switch as set: "light", "dark" or "system". */
export function useThemePreference() {
  return useSyncExternalStore(subscribePreference, readPreference, () => "light");
}

function mediaQuery() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY)
    : null;
}

function subscribeSystem(onChange) {
  const query = mediaQuery();
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

const systemPrefersDark = () => Boolean(mediaQuery()?.matches);

/** The theme the signed-in user gets: dark only for an admin who chose it. */
export function useAppTheme() {
  const preference = useThemePreference();
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  const user = useCurrentUser();
  if (!hasAnyRole(user, STAFF_ADMIN)) return "light";
  return preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
}

/** The theme of the area a component sits in, as AppLayout set it. */
export const ThemeContext = createContext("light");

export default function useTheme() {
  return useContext(ThemeContext);
}

// The tone of the status band a control is sitting in, so the school year
// menu in a band's corner matches the band without each page passing it.
export const BandToneContext = createContext("light");
