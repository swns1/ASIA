// darkReady.js — the pages that read correctly in dark mode.
//
// A page joins this list once every surface on it, including the dialogs it
// opens, draws from the design tokens. Until then it stays light while dark
// mode is on, beside a dark sidebar, rather than going half dark: a
// hand-typed white panel holding token text would turn unreadable.
//
// `match` is tested against the whole path, so a list page doesn't bring
// its detail and form pages along (/students yes, /students/12 no).
export const DARK_READY_PAGES = [
  // Admins get the admin home here, the only /dashboard dark mode reaches
  // (hooks/useTheme: dark is for super admins and admins).
  { label: "Dashboard", match: /^\/dashboard\/?$/ },
  { label: "Students", match: /^\/students\/?$/ },
];

export const isDarkReady = (pathname) => DARK_READY_PAGES.some((page) => page.match.test(pathname));
