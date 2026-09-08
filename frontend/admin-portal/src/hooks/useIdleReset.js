import { useEffect, useRef } from "react";

/**
 * Idle-timeout for the applicant kiosk flow (walk-in mode only — see
 * pages/apply/ApplicantFormPage.jsx). A parent reading a field or asking
 * their spouse a question easily pauses 60-90s; this fires a dismissible
 * warning at `timeoutMs - warnMs` and, absent any activity by then, calls
 * `onReset` at the full `timeoutMs` so the form clears itself before the
 * next family walks up to a device still holding the previous one's data.
 *
 * Listens on `window` for pointerdown/keydown/touchstart — broad enough to
 * cover mouse, touch and keyboard without binding to any specific control.
 *
 * @param {{ timeoutMs: number, warnMs?: number, onWarn?: () => void,
 *   onResume?: () => void, onReset?: () => void, enabled?: boolean }} options
 *   onWarn fires once, `warnMs` before the reset. onResume fires if activity
 *   arrives after onWarn but before onReset (so the caller can dismiss its
 *   warning dialog). onReset fires once, at the full timeout.
 */
export default function useIdleReset({ timeoutMs, warnMs = 30000, onWarn, onResume, onReset, enabled = true }) {
  const warnTimer = useRef(null);
  const resetTimer = useRef(null);
  const warned = useRef(false);
  // Refs so a re-render that only changes the callback identities (very
  // common — these are usually inline closures over page state) doesn't
  // tear down and re-arm the timers, silently resetting the countdown.
  // Synced in its own effect rather than assigned during render — mutating
  // a ref while rendering is unsafe under React's stricter concurrent
  // rules, even though this particular value is never read until later.
  const callbacks = useRef({ onWarn, onResume, onReset });
  useEffect(() => {
    callbacks.current = { onWarn, onResume, onReset };
  });

  useEffect(() => {
    if (!enabled) return undefined;

    function clear() {
      clearTimeout(warnTimer.current);
      clearTimeout(resetTimer.current);
    }

    function arm() {
      clear();
      const warnAt = Math.max(timeoutMs - warnMs, 0);
      warnTimer.current = setTimeout(() => {
        warned.current = true;
        callbacks.current.onWarn?.();
      }, warnAt);
      resetTimer.current = setTimeout(() => {
        warned.current = false;
        callbacks.current.onReset?.();
      }, timeoutMs);
    }

    function onActivity() {
      if (warned.current) {
        warned.current = false;
        callbacks.current.onResume?.();
      }
      arm();
    }

    arm();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, onActivity));
    return () => {
      clear();
      events.forEach((evt) => window.removeEventListener(evt, onActivity));
    };
    // callbacks are read via the ref above (kept in sync by the effect
    // above this one) and deliberately excluded here — including them
    // would tear down and re-arm the timers on every render.
  }, [enabled, timeoutMs, warnMs]);
}
