import { BrowserRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import StudentFormPage from "./pages/StudentFormPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import EnrollmentFormPage from "./pages/EnrollmentFormPage";
import EnrollmentDetailPage from "./pages/EnrollmentDetailPage";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import SubjectsPage from "./pages/SubjectsPage";
import GradingTemplatesPage from "./pages/GradingTemplatesPage";
import GradesPage from "./pages/GradesPage";
import GradeEntryPage from "./pages/GradeEntryPage";
import ScholarshipTypesPage from "./pages/ScholarshipTypesPage";
import ScholarshipsPage from "./pages/ScholarshipsPage";
import SchoolSettingsPage from "./pages/SchoolSettingsPage";
import FeeSchedulesPage   from "./pages/FeeSchedulesPage";
import InvoicesPage       from "./pages/InvoicesPage";
import PaymentsPage       from "./pages/PaymentsPage";
import AuditTrailPage     from "./pages/AuditTrailPage";
import RequirementsPage   from "./pages/RequirementsPage";
import UsersPage          from "./pages/UsersPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import AcademicCalendarPage from "./pages/AcademicCalendarPage";
import ReportCardPage from "./pages/ReportCardPage";
import SchoolFormsPage from "./pages/SchoolFormsPage";
import CORPrintPage       from "./pages/print/CORPrintPage";
import GradeSlipPrintPage from "./pages/print/GradeSlipPrintPage";
import ReceiptPrintPage   from "./pages/print/ReceiptPrintPage";
import InvoicePrintPage   from "./pages/print/InvoicePrintPage";
import SF1PrintPage from "./pages/print/SF1PrintPage";
import AttendancePage    from "./pages/AttendancePage";
import SF2PrintPage     from "./pages/print/SF2PrintPage";
import SF9PrintPage from "./pages/print/SF9PrintPage";
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

const P = ({ children }) => <PrivateRoute>{children}</PrivateRoute>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard"              element={<P><DashboardPage /></P>} />
        <Route path="/students"               element={<P><StudentsPage /></P>} />
        <Route path="/students/new"           element={<P><StudentFormPage /></P>} />
        <Route path="/students/:id"           element={<P><StudentDetailPage /></P>} />
        <Route path="/students/:id/edit"      element={<P><StudentFormPage /></P>} />
        <Route path="/enrollments"            element={<P><EnrollmentsPage /></P>} />
        <Route path="/enrollments/new"        element={<P><EnrollmentFormPage /></P>} />
        <Route path="/enrollments/:id"        element={<P><EnrollmentDetailPage /></P>} />
        <Route path="/enrollments/:id/edit"   element={<P><EnrollmentFormPage /></P>} />
        <Route path="/subjects"               element={<P><SubjectsPage /></P>} />
        <Route path="/grading-templates"      element={<P><GradingTemplatesPage /></P>} />
        <Route path="/grades"                 element={<P><GradesPage /></P>} />
        <Route path="/grades/summary"         element={<P><GradesPage /></P>} />
        <Route path="/grades/entry"           element={<P><GradeEntryPage /></P>} />
        <Route path="/scholarship-types"      element={<P><ScholarshipTypesPage /></P>} />
        <Route path="/scholarships"           element={<P><ScholarshipsPage /></P>} />
        <Route path="/settings"              element={<P><SchoolSettingsPage /></P>} />
        <Route path="/fee-schedules"         element={<P><FeeSchedulesPage /></P>} />
        <Route path="/invoices"              element={<P><InvoicesPage /></P>} />
        <Route path="/payments"              element={<P><PaymentsPage /></P>} />
        <Route path="/audit-trail"           element={<P><AuditTrailPage /></P>} />
        <Route path="/requirements"          element={<P><RequirementsPage /></P>} />
        <Route path="/users"                 element={<P><UsersPage /></P>} />
        <Route path="/analytics"             element={<P><AnalyticsPage /></P>} />
        <Route path="/academic-calendar"     element={<P><AcademicCalendarPage /></P>} />
        <Route path="/report-card/:enrollmentId" element={<P><ReportCardPage /></P>} />
        <Route path="/print/cor/:enrollmentId"        element={<P><CORPrintPage /></P>} />
        <Route path="/print/grade-slip/:enrollmentId" element={<P><GradeSlipPrintPage /></P>} />
        <Route path="/print/receipt/:paymentId"       element={<P><ReceiptPrintPage /></P>} />
        <Route path="/print/invoice/:invoiceId"       element={<P><InvoicePrintPage /></P>} />
        <Route path="/school-forms"          element={<P><SchoolFormsPage /></P>} />
        <Route path="/print/sf1"             element={<P><SF1PrintPage /></P>} />
        <Route path="/attendance"    element={<P><AttendancePage /></P>} />
        <Route path="/print/sf2"     element={<P><SF2PrintPage /></P>} />
        <Route path="/print/sf9/:enrollmentId" element={<P><SF9PrintPage /></P>} />
      </Routes>
    </BrowserRouter>
  );
}