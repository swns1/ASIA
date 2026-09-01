// ConfirmModal — kept as a thin re-export so the ~8 existing call sites
// (student delete, invoice void, user delete, subject remove, …) keep working
// untouched while the underlying dialog moves to the shared design system.
//
// The real implementation is ConfirmDialog in ui/Modal.jsx, which adds a
// genuine focus trap, an accessible name/description and shared Button styling.
// New code should import { ConfirmDialog } from "./ui/Modal" directly.
export { ConfirmDialog as default } from "./ui/Modal";
