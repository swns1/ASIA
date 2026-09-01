import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Trap focus inside a dialog while it's open.
 *
 * The app's previous ConfirmModal focused its cancel button on open but let
 * Tab escape into the page behind the backdrop, so keyboard and screen-reader
 * users could operate controls they couldn't see. This keeps Tab/Shift+Tab
 * cycling within the dialog, handles Escape, and restores focus to whatever
 * was focused before the dialog opened.
 *
 * @param {React.RefObject<HTMLElement>} ref  the dialog container
 * @param {{ enabled?: boolean, onEscape?: () => void }} options
 */
export default function useFocusTrap(ref, { enabled = true, onEscape } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const previouslyFocused = document.activeElement;

    // Focus the first sensible target. Prefer an element that opts in with
    // data-autofocus (e.g. the cancel button on a destructive confirm, so the
    // safe choice is selected by default), else the first focusable child.
    const preferred = node.querySelector("[data-autofocus]");
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE));
    (preferred ?? focusables()[0] ?? node).focus?.();

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Returning focus to the trigger is what makes keyboard navigation feel
      // continuous rather than dumping the user at the top of the document.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.();
    };
  }, [ref, enabled, onEscape]);
}
