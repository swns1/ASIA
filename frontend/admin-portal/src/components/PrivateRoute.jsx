import { Navigate } from "react-router-dom";
import { isTokenValid } from "../utils/auth";

export default function PrivateRoute({ children }) {
  if (!isTokenValid()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
