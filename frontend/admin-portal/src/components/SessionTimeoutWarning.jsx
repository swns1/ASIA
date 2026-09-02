import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { clearAuthSession } from "../utils/auth";
import { refreshToken } from "../api/identityApi";
import Button from "./ui/Button";

const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes before expiry

// Session-expiry warning.
//
// Extracted from AppLayout so it can mount once for ALL authenticated portals.
// It previously lived inside the staff shell only, which meant guardians got
// no warning at all — their session simply died mid-task.
export default function SessionTimeoutWarning() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [extending, setExtending] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    function scheduleCheck() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const token = sessionStorage.getItem("access_token");
      if (!token) {
        setShow(false);
        return;
      }
      try {
        const exp = JSON.parse(atob(token.split(".")[1])).exp * 1000;
        const msLeft = exp - Date.now();
        if (msLeft <= WARN_BEFORE_MS) {
          setShow(true);
          return;
        }
        setShow(false);
        timerRef.current = setTimeout(() => setShow(true), msLeft - WARN_BEFORE_MS);
      } catch {
        /* malformed token — leave it to the API layer to reject */
      }
    }

    scheduleCheck();
    // Re-evaluating every minute also re-syncs after a sign-out/sign-in within
    // the same tab, so a stale timer can't outlive the session that created it.
    const id = setInterval(scheduleCheck, 60_000);
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(id);
    };
  }, []);

  async function handleExtend() {
    setExtending(true);
    try {
      const data = await refreshToken();
      if (data?.access) {
        sessionStorage.setItem("access_token", data.access);
        setShow(false);
      }
    } catch {
      clearAuthSession();
      navigate("/login");
    } finally {
      setExtending(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 right-6 z-[2000] w-[min(340px,calc(100vw-3rem))] rounded-xl border-[1.5px] border-brand-300 bg-white p-5 shadow-2xl"
        >
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-200">
              <i className="ti ti-clock text-[18px] text-brand-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-neutral-900">Session expiring soon</div>
              <div className="text-xs text-neutral-700">
                You&apos;ll be signed out in less than 5 minutes. Any unsaved work will be lost.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" fullWidth onClick={handleLogout}>
              Log out
            </Button>
            <Button size="sm" fullWidth loading={extending} onClick={handleExtend}>
              {extending ? "Extending…" : "Stay signed in"}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
