import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { isTokenValid, getCurrentUser, hasAnyRole, homeFor } from "../utils/auth";
import { refreshSession } from "../api/apiClient";
import RouteFallback from "./RouteFallback";

// No valid access token is not the same as signed out. The token lives in
// sessionStorage, so it is missing in every new tab and every reopened
// browser, and it expires after 2 hours. The refresh cookie outlives all of
// those (a week under "Remember me"), but this used to redirect to /login
// without ever asking it -- so "Remember me for 1 week" did nothing. Try one
// silent refresh first; only a refusal means signed out.
//
// Checked on every render, not once: React Router reuses this component
// across navigations, so a token that expires mid-session is caught on the
// next page change.
export default function PrivateRoute({ children, allowedRoles }) {
  const valid = isTokenValid();
  // A fresh object per outcome, so a second restore in the same instance
  // still re-renders.
  const [restore, setRestore] = useState(null);

  useEffect(() => {
    if (valid) return undefined;
    let cancelled = false;
    refreshSession()
      .then(() => { if (!cancelled) setRestore({ ok: true }); })
      .catch(() => { if (!cancelled) setRestore({ ok: false }); });
    return () => { cancelled = true; };
  }, [valid]);

  if (!valid) {
    if (restore && !restore.ok) return <Navigate to="/login" replace />;
    return <RouteFallback fullPage />;
  }

  const user = getCurrentUser();
  if (allowedRoles && !hasAnyRole(user, allowedRoles)) {
    return <Navigate to={homeFor(user)} replace />;
  }
  return children;
}
