import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import StudentFormPage from "./pages/StudentFormPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import EnrollmentFormPage from "./pages/EnrollmentFormPage";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import SubjectsPage from "./pages/SubjectsPage";
import GradingTemplatesPage from "./pages/GradingTemplatesPage";
import GradeEntryPage from "./pages/GradeEntryPage";
import GradeSummaryPage from "./pages/GradeSummaryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentFormPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/students/:id/edit" element={<StudentFormPage />} />
        <Route path="/enrollments" element={<EnrollmentsPage />} />
        <Route path="/enrollments/new" element={<EnrollmentFormPage />} />
        <Route path="/enrollments/:id/edit" element={<EnrollmentFormPage />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/grading-templates" element={<GradingTemplatesPage />} />
        <Route path="/grades/entry" element={<GradeEntryPage />} />
        <Route path="/grades"         element={<GradeSummaryPage />} />
        <Route path="/grades/summary" element={<GradeSummaryPage />} />
      </Routes>
    </BrowserRouter>
  );
}

