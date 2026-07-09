import { Navigate } from "react-router-dom";
import { isTokenValid, getCurrentUser, hasAnyRole } from "../utils/auth";

export default function PrivateRoute({ children, allowedRoles }) {
  if (!isTokenValid()) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !hasAnyRole(getCurrentUser(), allowedRoles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
