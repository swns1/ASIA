import { useEffect } from "react";
import { getCurrentUser, portalLabelFor } from "../utils/auth";

export function usePageTitle(title) {
  useEffect(() => {
    const label = portalLabelFor(getCurrentUser()?.role);
    document.title = title ? `${title} · ${label}` : label;
  }, [title]);
}
