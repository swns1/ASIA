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
  // Both homes: the admin home for super admins and admins, the shared
  // staff dashboard for everyone else.
  { label: "Dashboard", match: /^\/dashboard\/?$/ },
  { label: "Students", match: /^\/students\/?$/ },
  { label: "Student detail", match: /^\/students\/\d+\/?$/ },
  // The full-page form (ThemeArea), new and edit.
  { label: "Student form", match: /^\/students\/(new|\d+\/edit)\/?$/ },
  { label: "Student Applications", match: /^\/student-applications\/?$/ },
  // The list and its entry, summary and observed-values tabs.
  { label: "Grades", match: /^\/grades(\/[a-z]+)?\/?$/ },
  { label: "Grading Setup", match: /^\/grading-templates\/?$/ },
  { label: "Enrollments", match: /^\/enrollments\/?$/ },
  // The full-page form (ThemeArea), new and edit; not the detail page.
  { label: "Enrollment form", match: /^\/enrollments\/(new|\d+\/edit)\/?$/ },
  { label: "Users", match: /^\/users\/?$/ },
  { label: "Teacher Advisories", match: /^\/teacher-advisories\/?$/ },
  { label: "Subjects", match: /^\/subjects\/?$/ },
  { label: "Audit Trail", match: /^\/audit-trail\/?$/ },
  // The list and one year's page, not Compare (/school-years/compare).
  { label: "School Years", match: /^\/school-years(\/(?!compare\/?$)[^/]+)?\/?$/ },
  { label: "School Year Compare", match: /^\/school-years\/compare\/?$/ },
  { label: "Analytics", match: /^\/analytics\/?$/ },
  { label: "Invoices", match: /^\/invoices\/?$/ },
  { label: "Payments", match: /^\/payments\/?$/ },
  { label: "Requirements", match: /^\/requirements\/?$/ },
  // One enrollment's page; not the list or the full-page form.
  { label: "Enrollment detail", match: /^\/enrollments\/\d+\/?$/ },
  { label: "Scholarships", match: /^\/scholarships\/?$/ },
  { label: "Scholarship Types", match: /^\/scholarship-types\/?$/ },
  { label: "School Forms", match: /^\/school-forms\/?$/ },
  { label: "Academic Calendar", match: /^\/academic-calendar\/?$/ },
  { label: "Billing Settings", match: /^\/settings\/?$/ },
  { label: "My Sections", match: /^\/my-sections\/?$/ },
  // Renders My Sections' SectionDetail and StudentsTab, so it joins with it.
  { label: "Sections", match: /^\/sections\/?$/ },
  // Built on the tokens from the start: each staff member's theme and password.
  { label: "My Settings", match: /^\/my-settings\/?$/ },
  // The guardian portal (GuardianLayout, through ThemeArea): home, one
  // child's records, and the guardian's own settings.
  { label: "Guardian home", match: /^\/guardian\/?$/ },
  { label: "Guardian child records", match: /^\/guardian\/child\/\d+\/?$/ },
  { label: "Guardian settings", match: /^\/guardian\/settings\/?$/ },
];

export const isDarkReady = (pathname) => DARK_READY_PAGES.some((page) => page.match.test(pathname));
