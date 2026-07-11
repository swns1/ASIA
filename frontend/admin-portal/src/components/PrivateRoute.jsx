import { Navigate } from "react-router-dom";
import { isTokenValid, getCurrentUser, hasAnyRole } from "../utils/auth";

// Where to send a logged-in user who lacks access to the route they hit.
// Guardians go to their own portal; everyone else to the staff dashboard.
// (Sending a guardian to /dashboard would loop, since that route is staff-only.)
function homeFor(user) {
  return user?.role === "guardian" ? "/guardian" : "/dashboard";
}

export default function PrivateRoute({ children, allowedRoles }) {
  if (!isTokenValid()) {
    return <Navigate to="/login" replace />;
  }
  const user = getCurrentUser();
  if (allowedRoles && !hasAnyRole(user, allowedRoles)) {
    return <Navigate to={homeFor(user)} replace />;
  }
  return children;
}
