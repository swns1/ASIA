import { STAFF_ADMIN, ACADEMIC_STAFF, GRADE_ROLES, BILLING_ROLES } from "../utils/auth";

// The staff sidebar's pages. An item without allowedRoles shows to every staff
// role. Each item's roles must sit inside its route's roles in App.jsx
// (navRoles.test.js), so the menu never offers a page that turns its reader away.

// Sections are ordered by how often a typical staff user reaches for them,
// not by domain area — "Frequently used" pulls the four highest-traffic
// destinations out of what used to be one flat 11-item "Main" section.
export const NAV = [
  {
    section: "Frequently used",
    items: [
      { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
      { label: "Students",    icon: "ti-users",            path: "/students"    },
      { label: "Enrollments", icon: "ti-clipboard-list",   path: "/enrollments" },
      { label: "Grades",      icon: "ti-chart-bar",        path: "/grades",      allowedRoles: GRADE_ROLES },
    ],
  },
  {
    section: "Academics",
    items: [
      { label: "Applications",      icon: "ti-user-plus",         path: "/student-applications", allowedRoles: ACADEMIC_STAFF },
      // Staff see every section on /sections; My Sections is the teacher's
      // own list (the route still takes staff, for old links).
      { label: "Sections",          icon: "ti-layout-grid",       path: "/sections",           allowedRoles: ACADEMIC_STAFF },
      { label: "My Sections",       icon: "ti-users-group",       path: "/my-sections",        allowedRoles: ["teacher"] },
      { label: "Subjects",          icon: "ti-book",              path: "/subjects"            },
      { label: "Requirements",      icon: "ti-file-check",        path: "/requirements",        allowedRoles: ACADEMIC_STAFF },
      { label: "Academic Calendar", icon: "ti-calendar-event",    path: "/academic-calendar"   },
      { label: "School Forms",      icon: "ti-forms",             path: "/school-forms"        },
      { label: "Analytics",         icon: "ti-chart-dots-3",      path: "/analytics",           allowedRoles: GRADE_ROLES },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",          icon: "ti-receipt",  path: "/invoices",          allowedRoles: BILLING_ROLES },
      { label: "Payments",          icon: "ti-cash",     path: "/payments",          allowedRoles: BILLING_ROLES },
      { label: "Scholarships",      icon: "ti-discount", path: "/scholarships",      allowedRoles: ACADEMIC_STAFF },
      { label: "Scholarship Types", icon: "ti-discount", path: "/scholarship-types", allowedRoles: ACADEMIC_STAFF },
    ],
  },
  {
    section: "Admin",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { label: "School Years",       icon: "ti-calendar-stats",   path: "/school-years",       allowedRoles: STAFF_ADMIN },
      { label: "Users",              icon: "ti-user-cog",         path: "/users",             allowedRoles: STAFF_ADMIN },
      { label: "Audit Trail",        icon: "ti-shield-check",     path: "/audit-trail",        allowedRoles: STAFF_ADMIN },
      { label: "Billing Settings",   icon: "ti-settings",         path: "/settings",           allowedRoles: BILLING_ROLES },
      { label: "Grading Setup",      icon: "ti-report-analytics", path: "/grading-templates",  allowedRoles: ACADEMIC_STAFF },
      { label: "Teacher Advisories", icon: "ti-user-check",       path: "/teacher-advisories", allowedRoles: ACADEMIC_STAFF },
    ],
  },
];
