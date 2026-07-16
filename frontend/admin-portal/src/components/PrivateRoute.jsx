import { Navigate } from "react-router-dom";
import { isTokenValid, getCurrentUser, hasAnyRole, homeFor } from "../utils/auth";

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
