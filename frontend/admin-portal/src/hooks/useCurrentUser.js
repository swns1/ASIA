import { useEffect, useState } from "react";
import { CURRENT_USER_EVENT, getCurrentUser } from "../utils/auth";

/**
 * The signed-in user, kept current. Re-reads when setCurrentUser() runs --
 * after editing your own profile, or when a session is restored in a new tab.
 */
export default function useCurrentUser() {
  const [user, setUser] = useState(getCurrentUser);

  useEffect(() => {
    const onChange = () => setUser(getCurrentUser());
    window.addEventListener(CURRENT_USER_EVENT, onChange);
    return () => window.removeEventListener(CURRENT_USER_EVENT, onChange);
  }, []);

  return user;
}
