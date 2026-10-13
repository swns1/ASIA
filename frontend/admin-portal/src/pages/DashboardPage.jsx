import { usePageTitle } from "../hooks/usePageTitle";
import AdminHome from "./dashboard/AdminHome";
import RegistrarHome from "./dashboard/RegistrarHome";
import AccountingHome from "./dashboard/AccountingHome";
import TeacherHome from "./dashboard/TeacherHome";
import { getCurrentUser, hasAnyRole, STAFF_ADMIN } from "../utils/auth";

/**
 * /dashboard: each staff role lands on its own task-first home, all built
 * from the same pieces (dashboard/HomeParts.jsx, loaded by useHomeData) so
 * they read and behave alike:
 *
 *   super_admin, admin -> AdminHome (the approved "Principal / Admin" board)
 *   registrar          -> RegistrarHome
 *   accounting         -> AccountingHome
 *   teacher            -> TeacherHome
 *
 * The route admits staff only (STAFF_ALL in App.jsx). The old shared staff
 * dashboard every role used to get is gone (2026-10-12): each role's home
 * replaced it.
 */
export default function DashboardPage() {
  usePageTitle("Dashboard");
  const user = getCurrentUser();
  if (hasAnyRole(user, STAFF_ADMIN)) return <AdminHome />;
  if (hasAnyRole(user, ["registrar"])) return <RegistrarHome />;
  if (hasAnyRole(user, ["accounting"])) return <AccountingHome />;
  return <TeacherHome />;
}
