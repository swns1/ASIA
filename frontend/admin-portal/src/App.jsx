import { Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Toaster } from "react-hot-toast";
import PrivateRoute from "./components/PrivateRoute";
import { SchoolYearProvider } from "./context/SchoolYearContext";
import AppLayout from "./components/AppLayout";
import GuardianLayout from "./components/GuardianLayout";
import SessionTimeoutWarning from "./components/SessionTimeoutWarning";
import PageTransition from "./components/PageTransition";
import RouteFallback from "./components/RouteFallback";
import lazyRoute from "./utils/lazyRoute";
import { toasterProps } from "./utils/toastConfig";
import { STAFF_ADMIN, ACADEMIC_STAFF, GRADE_ROLES, BILLING_ROLES, STAFF_ALL } from "./utils/auth";
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

// ── Eager: the two routes that must not cost a second round trip ─────────────
//
// LoginPage is the first thing every user sees and the only route reachable
// without a token, so splitting it would add a request to the critical path it
// is supposed to shorten. NotFoundPage is the catch-all — a fallback that
// itself has to be fetched is a fallback that can fail.
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

// ── Lazy: everything behind the login ────────────────────────────────────────
//
// All 34 of these were in the entry chunk, which is how a guardian opening one
// child's grades came to download the entire staff admin portal — every
// thousand-line page, all eight print documents, the analytics charts and the
// audit trail — before the login form could paint.
//
// Each name below becomes its own chunk, fetched on the navigation that
// actually needs it. The route table underneath is unchanged: every <P
// roles={...}> guard is exactly what it was, so this moves *when* code
// arrives without moving *who* may reach it.
const DashboardPage         = lazyRoute(() => import("./pages/DashboardPage"));
const StudentsPage          = lazyRoute(() => import("./pages/StudentsPage"));
const StudentFormPage       = lazyRoute(() => import("./pages/StudentFormPage"));
const StudentDetailPage     = lazyRoute(() => import("./pages/StudentDetailPage"));
const EnrollmentFormPage    = lazyRoute(() => import("./pages/EnrollmentFormPage"));
const EnrollmentDetailPage  = lazyRoute(() => import("./pages/EnrollmentDetailPage"));
const EnrollmentsPage       = lazyRoute(() => import("./pages/EnrollmentsPage"));
const SubjectsPage          = lazyRoute(() => import("./pages/SubjectsPage"));
const GradingSettingsPage   = lazyRoute(() => import("./pages/GradingSettingsPage"));
const GradesPage            = lazyRoute(() => import("./pages/GradesPage"));
const ScholarshipTypesPage  = lazyRoute(() => import("./pages/ScholarshipTypesPage"));
const ScholarshipsPage      = lazyRoute(() => import("./pages/ScholarshipsPage"));
const BillingSettingsPage   = lazyRoute(() => import("./pages/BillingSettingsPage"));
const InvoicesPage          = lazyRoute(() => import("./pages/InvoicesPage"));
const PaymentsPage          = lazyRoute(() => import("./pages/PaymentsPage"));
const AuditTrailPage        = lazyRoute(() => import("./pages/AuditTrailPage"));
const RequirementsPage      = lazyRoute(() => import("./pages/RequirementsPage"));
const UsersPage             = lazyRoute(() => import("./pages/UsersPage"));
const AnalyticsPage         = lazyRoute(() => import("./pages/AnalyticsPage"));
const AcademicCalendarPage  = lazyRoute(() => import("./pages/AcademicCalendarPage"));
const ReportCardPage        = lazyRoute(() => import("./pages/ReportCardPage"));
const SchoolFormsPage       = lazyRoute(() => import("./pages/SchoolFormsPage"));
const TeacherAdvisoriesPage = lazyRoute(() => import("./pages/TeacherAdvisoriesPage"));
const TeacherSectionsPage   = lazyRoute(() => import("./pages/TeacherSectionsPage"));
const GuardianHomePage      = lazyRoute(() => import("./pages/GuardianHomePage"));
const GuardianChildPage     = lazyRoute(() => import("./pages/GuardianChildPage"));

// The print documents are the clearest case for splitting: eight chunks that
// the vast majority of sessions never open, and the ones that do pull in
// html2pdf.js (already async) on top.
const CORPrintPage       = lazyRoute(() => import("./pages/print/CORPrintPage"));
const GradeSlipPrintPage = lazyRoute(() => import("./pages/print/GradeSlipPrintPage"));
const ReceiptPrintPage   = lazyRoute(() => import("./pages/print/ReceiptPrintPage"));
const InvoicePrintPage   = lazyRoute(() => import("./pages/print/InvoicePrintPage"));
const SF1PrintPage       = lazyRoute(() => import("./pages/print/SF1PrintPage"));
const SF2PrintPage       = lazyRoute(() => import("./pages/print/SF2PrintPage"));
const SF9PrintPage       = lazyRoute(() => import("./pages/print/SF9PrintPage"));
const SF10PrintPage      = lazyRoute(() => import("./pages/print/SF10PrintPage"));

const P = ({ children, roles }) => <PrivateRoute allowedRoles={roles}>{children}</PrivateRoute>;

const GUARDIAN = ["guardian"];

// Layout-only routes. These carry NO role check of their own — every leaf route
// below keeps its original <P roles={...}> guard untouched, so the permission
// matrix is exactly what it was; only the shell moved up a level. Previously
// each page imported and rendered AppLayout itself (25 wrap sites across 21
// files), which meant the sidebar, toast host and session timer all unmounted
// and remounted on every navigation.
// The Suspense boundary sits INSIDE the shell, not around it. Placed outside,
// every navigation would blank the sidebar and the session timer while the
// next page's chunk downloaded — undoing the remount fix above and making the
// app feel like it reloads on each click. Here, only the content column shows
// the fallback; the chrome never unmounts.
const StaffShell = () => (
  <AppLayout>
    <PageTransition>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </PageTransition>
  </AppLayout>
);

const GuardianShell = () => (
  <GuardianLayout>
    <PageTransition>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </PageTransition>
  </GuardianLayout>
);

export default function App() {
  return (
    // reducedMotion="user" is the one place the OS "reduce motion" setting
    // reaches framer-motion. The @media (prefers-reduced-motion) block in
    // index.css only governs CSS transitions and keyframes; framer-motion
    // drives style properties from JavaScript frame by frame, so every one of
    // the ~35 animated components was ignoring that setting entirely. This
    // disables transform and layout animation while leaving opacity and colour
    // fades, which is the behaviour the setting actually asks for.
    <MotionConfig reducedMotion="user">
    <SchoolYearProvider>
    <BrowserRouter>
      {/* Outer boundary for the chrome-less routes — the focused forms and the
          print documents, which render no shell and so have no inner one.
          Shell routes never reach this: React uses the nearest boundary, which
          is the one inside StaffShell/GuardianShell above. */}
      <Suspense fallback={<RouteFallback fullPage />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* ── Staff portal (sidebar shell) ── */}
        <Route element={<StaffShell />}>
          <Route path="/dashboard"              element={<P roles={STAFF_ALL}><DashboardPage /></P>} />
          <Route path="/students"               element={<P roles={STAFF_ALL}><StudentsPage /></P>} />
          <Route path="/students/:id"           element={<P roles={STAFF_ALL}><StudentDetailPage /></P>} />
          <Route path="/enrollments"            element={<P roles={STAFF_ALL}><EnrollmentsPage /></P>} />
          <Route path="/enrollments/:id"        element={<P roles={STAFF_ALL}><EnrollmentDetailPage /></P>} />
          <Route path="/subjects"               element={<P roles={STAFF_ALL}><SubjectsPage /></P>} />
          <Route path="/grading-templates"      element={<P roles={GRADE_ROLES}><GradingSettingsPage /></P>} />
          <Route path="/grades"                 element={<P roles={GRADE_ROLES}><GradesPage /></P>} />
          <Route path="/grades/entry"           element={<P roles={GRADE_ROLES}><GradesPage /></P>} />
          <Route path="/grades/summary"         element={<P roles={GRADE_ROLES}><GradesPage /></P>} />
          <Route path="/scholarship-types"      element={<P roles={ACADEMIC_STAFF}><ScholarshipTypesPage /></P>} />
          <Route path="/scholarships"           element={<P roles={ACADEMIC_STAFF}><ScholarshipsPage /></P>} />
          <Route path="/settings"               element={<P roles={BILLING_ROLES}><BillingSettingsPage /></P>} />
          <Route path="/invoices"               element={<P roles={BILLING_ROLES}><InvoicesPage /></P>} />
          <Route path="/payments"               element={<P roles={BILLING_ROLES}><PaymentsPage /></P>} />
          <Route path="/audit-trail"            element={<P roles={STAFF_ADMIN}><AuditTrailPage /></P>} />
          <Route path="/requirements"           element={<P roles={ACADEMIC_STAFF}><RequirementsPage /></P>} />
          <Route path="/users"                  element={<P roles={STAFF_ADMIN}><UsersPage /></P>} />
          <Route path="/analytics"              element={<P roles={GRADE_ROLES}><AnalyticsPage /></P>} />
          <Route path="/academic-calendar"      element={<P roles={STAFF_ALL}><AcademicCalendarPage /></P>} />
          <Route path="/school-forms"           element={<P roles={STAFF_ALL}><SchoolFormsPage /></P>} />
          <Route path="/teacher-advisories"     element={<P roles={ACADEMIC_STAFF}><TeacherAdvisoriesPage /></P>} />
          <Route path="/my-sections"            element={<P roles={GRADE_ROLES}><TeacherSectionsPage /></P>} />
        </Route>

        {/* ── Focused full-page forms ──
            Deliberately outside the shell: these are single-task flows that
            have never shown the sidebar, so the user isn't invited to navigate
            away mid-entry and lose their work. */}
        <Route path="/students/new"           element={<P roles={STAFF_ALL}><StudentFormPage /></P>} />
        <Route path="/students/:id/edit"      element={<P roles={STAFF_ALL}><StudentFormPage /></P>} />
        <Route path="/enrollments/new"        element={<P roles={STAFF_ALL}><EnrollmentFormPage /></P>} />
        <Route path="/enrollments/:id/edit"   element={<P roles={STAFF_ALL}><EnrollmentFormPage /></P>} />

        {/* Report card is backend-scoped: guardians may open only their own
            child's (403 otherwise), so it stays reachable to any authenticated
            user — and chrome-less, since it's a printable document. */}
        <Route path="/report-card/:enrollmentId" element={<P><ReportCardPage /></P>} />

        {/* ── Print / PDF documents (no shell by design) ── */}
        <Route path="/print/cor/:enrollmentId"        element={<P roles={STAFF_ALL}><CORPrintPage /></P>} />
        <Route path="/print/grade-slip/:enrollmentId" element={<P roles={STAFF_ALL}><GradeSlipPrintPage /></P>} />
        <Route path="/print/receipt/:paymentId"       element={<P roles={BILLING_ROLES}><ReceiptPrintPage /></P>} />
        <Route path="/print/invoice/:invoiceId"       element={<P roles={BILLING_ROLES}><InvoicePrintPage /></P>} />
        <Route path="/print/sf1"             element={<P roles={STAFF_ALL}><SF1PrintPage /></P>} />
        <Route path="/print/sf2"     element={<P roles={STAFF_ALL}><SF2PrintPage /></P>} />
        <Route path="/print/sf9/:enrollmentId" element={<P roles={STAFF_ALL}><SF9PrintPage /></P>} />
        <Route path="/print/sf10/:studentId" element={<P roles={STAFF_ALL}><SF10PrintPage /></P>} />

        {/* ── Guardian (parent) portal ── */}
        <Route element={<GuardianShell />}>
          <Route path="/guardian"                     element={<P roles={GUARDIAN}><GuardianHomePage /></P>} />
          <Route path="/guardian/child/:enrollmentId" element={<P roles={GUARDIAN}><GuardianChildPage /></P>} />
        </Route>

        {/* Catch-all: must stay outside PrivateRoute so a bad URL always
            shows 404 regardless of auth state. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>

      {/* Mounted once for every authenticated portal. It renders nothing
          without a valid token, and guardians now get the same expiry warning
          staff do — previously it lived inside the staff shell only. */}
      <SessionTimeoutWarning />
    </BrowserRouter>

    {/* One toast host for the whole app, so toasts survive navigation and
        work on the login page (which never had a Toaster of its own). */}
    <Toaster {...toasterProps} />
    </SchoolYearProvider>
    </MotionConfig>
  );
}
