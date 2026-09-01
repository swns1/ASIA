// Shared react-hot-toast theming — previously duplicated verbatim in both
// AppLayout.jsx and GuardianLayout.jsx. The <Toaster> itself now mounts once
// at the app root so toasts survive navigation (and work on the login page,
// which never had a Toaster of its own).

export const toastOptions = {
  duration: 4000,
  style: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    borderRadius: 10,
    color: "#1a0a0a",
    boxShadow: "0 8px 28px rgba(224,49,49,0.12)",
  },
  success: {
    iconTheme: { primary: "#2e6b0d", secondary: "#e8f5e0" },
    style: { border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#256009" },
  },
  error: {
    duration: 6000, // failures need longer to read than confirmations
    iconTheme: { primary: "#9b2020", secondary: "#fde8e8" },
    style: { border: "1px solid #fca5a5", background: "#fff0f0", color: "#9b2020" },
  },
};

export const toasterProps = {
  position: "bottom-right",
  toastOptions,
};
