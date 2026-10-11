// Shared react-hot-toast theming — previously duplicated verbatim in both
// AppLayout.jsx and GuardianLayout.jsx. The host itself (components/
// AppToaster.jsx) mounts once inside the router so toasts survive navigation
// (and work on the login page, which never had a Toaster of its own).
//
// Every colour is a --toast-* variable from styles/tokens.css, so a toast
// over a dark page turns dark with it; the light values are the literals
// these styles used before.

export const toastOptions = {
  duration: 4000,
  style: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    borderRadius: 10,
    background: "var(--toast-bg)",
    color: "var(--toast-text)",
    boxShadow: "var(--toast-shadow)",
  },
  success: {
    iconTheme: { primary: "var(--toast-success-icon)", secondary: "var(--toast-success-icon-on)" },
    style: {
      border: "1px solid var(--toast-success-border)",
      background: "var(--toast-success-bg)",
      color: "var(--toast-success-text)",
    },
  },
  error: {
    duration: 6000, // failures need longer to read than confirmations
    iconTheme: { primary: "var(--toast-error-icon)", secondary: "var(--toast-error-icon-on)" },
    style: {
      border: "1px solid var(--toast-error-border)",
      background: "var(--toast-error-bg)",
      color: "var(--toast-error-text)",
    },
  },
};

export const toasterProps = {
  position: "bottom-right",
  toastOptions,
};
