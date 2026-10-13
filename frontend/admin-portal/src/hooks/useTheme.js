import { createContext, useContext, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import useCurrentUser from "./useCurrentUser";
import { CURRENT_USER_EVENT, getCurrentUser, hasAnyRole, STAFF_ALL } from "../utils/auth";
import { isDarkReady } from "../constants/darkReady";

// useTheme — light or dark.
//
// Every staff member picks Light, Dark or Auto (the same as their computer)
// on their own My Settings page (pages/MySettingsPage), linked from the foot
// of the sidebar; a guardian does the same on the portal's My settings
// (pages/GuardianSettingsPage), from the account button in its top bar. The
// choice is kept in this browser under their own account, so people who
// share a computer each keep theirs. Anyone signed out gets light.
//
// The theme isn't set on the whole document. AppLayout sets `data-theme` on
// the sidebar, and on the page area only for pages already converted
// (constants/darkReady.js), so an unconverted page stays fully light rather
// than half dark. ThemeArea does the same for the full-page forms and the
// guardian portal, which have no AppLayout. ThemeContext tells a component
// which theme it sits in.

const KEY = "asia.theme";
// The switches this replaced: the admin-only developer switch, and the status
// band's own before it. Cleared on the next save.
const OLD_KEYS = ["asia.dev.theme", "asia.dev.statusBandTone"];
// Same-tab updates; the `storage` event covers other tabs.
const EVENT = "asia:theme";
const PREFERENCES = ["light", "dark", "system"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

// One choice per person: the key carries the signed-in user's id.
function storageKey() {
  const id = getCurrentUser()?.id;
  return id == null ? KEY : `${KEY}.${id}`;
}

function readPreference() {
  try {
    const stored = localStorage.getItem(storageKey());
    return PREFERENCES.includes(stored) ? stored : "light";
  } catch {
    // Storage blocked (private window, cleared site data): the default.
    return "light";
  }
}

// Re-read on a save (this tab or another) and when someone else signs in,
// since their own choice then applies.
const PREFERENCE_EVENTS = [EVENT, "storage", CURRENT_USER_EVENT];

function subscribePreference(onChange) {
  PREFERENCE_EVENTS.forEach((name) => window.addEventListener(name, onChange));
  return () => PREFERENCE_EVENTS.forEach((name) => window.removeEventListener(name, onChange));
}

/** Saves the signed-in person's choice: "light", "dark" or "system". */
export function setThemePreference(preference) {
  try {
    const key = storageKey();
    if (preference === "dark" || preference === "system") localStorage.setItem(key, preference);
    else localStorage.removeItem(key);
    OLD_KEYS.forEach((old) => localStorage.removeItem(old));
  } catch {
    // Nowhere to keep it; the app stays light.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The signed-in person's choice: "light", "dark" or "system". */
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

// Everyone who has a settings page to choose on.
const THEME_ROLES = [...STAFF_ALL, "guardian"];

/** The theme the signed-in user gets: their choice; light for anyone
 *  signed out. */
export function useAppTheme() {
  const preference = useThemePreference();
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  const user = useCurrentUser();
  if (!hasAnyRole(user, THEME_ROLES)) return "light";
  return preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
}

/** The theme of the current route's page: dark only once the page has been
 *  converted (constants/darkReady.js). AppLayout's page area, ThemeArea (the
 *  full-page forms) and what floats over a page (toasts, the session
 *  warning) all follow it, so they match the page under them. */
export function usePageTheme() {
  const appTheme = useAppTheme();
  const { pathname } = useLocation();
  return appTheme === "dark" && isDarkReady(pathname) ? "dark" : "light";
}

/** The theme of the area a component sits in, as AppLayout set it. */
export const ThemeContext = createContext("light");

export default function useTheme() {
  return useContext(ThemeContext);
}

// The tone of the status band a control is sitting in, so the school year
// menu in a band's corner matches the band without each page passing it.
export const BandToneContext = createContext("light");
