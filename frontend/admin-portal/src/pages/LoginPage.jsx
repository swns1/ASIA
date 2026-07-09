import { usePageTitle } from "../hooks/usePageTitle";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { login } from "../api/identityApi";
import logo from "../assets/logo.png";
import { useNavigate } from "react-router-dom";
import { setCurrentUser } from "../utils/auth";

export default function LoginPage() {
  usePageTitle("Login");
  const navigate = useNavigate();

  const [identifier,    setIdentifier]    = useState("");
  const [password,      setPassword]      = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [forgotVisible, setForgotVisible] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login({ identifier, password });
      sessionStorage.setItem("access_token", res.access);
      setCurrentUser(res.user);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#fff8f6", fontFamily: "'DM Sans', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
      `}</style>

      {/* Blobs */}
      <motion.div
        className="absolute pointer-events-none"
        initial={{ x: 60, y: -60, opacity: 0 }}
        animate={{ x: 0, y: [0, -8, 0], opacity: 0.85 }}
        transition={{ x: { type: "spring", stiffness: 80, damping: 18, delay: 0 }, y: { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }, opacity: { duration: 0.5 } }}
        style={{
          top: -60, right: -30, width: 220, height: 220,
          borderRadius: "60% 40% 70% 30% / 50% 60% 40% 50%",
          background: "linear-gradient(135deg, #ff6b6b, #e03131)",
        }}
      />
      <motion.div
        className="absolute pointer-events-none"
        initial={{ x: -50, y: 50, opacity: 0 }}
        animate={{ x: 0, y: [0, 7, 0], opacity: 0.7 }}
        transition={{ x: { type: "spring", stiffness: 80, damping: 18, delay: 0.08 }, y: { duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }, opacity: { duration: 0.5, delay: 0.08 } }}
        style={{
          bottom: -40, left: -20, width: 130, height: 130,
          borderRadius: "40% 60% 30% 70% / 60% 40% 60% 40%",
          background: "linear-gradient(135deg, #ff9a9a, #e03131)",
        }}
      />
      <motion.div
        className="absolute pointer-events-none"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, y: [0, -5, 0], opacity: 0.5 }}
        transition={{ x: { type: "spring", stiffness: 80, damping: 18, delay: 0.15 }, y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }, opacity: { duration: 0.5, delay: 0.15 } }}
        style={{
          top: "55%", right: -50, width: 80, height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #ffcbcb, #ff6b6b)",
        }}
      />

      {/* Header */}
      <div className="relative z-10 text-center mb-8">
        <motion.div
          className="mx-auto mb-4 flex items-center justify-center"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.05 }}
          style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "white", border: "2px solid #fdd",
            boxShadow: "0 2px 8px rgba(224,49,49,0.12)",
          }}
        >
          <img src={logo} alt="South Lakes Integrated School" style={{ height: 200, width: 200, objectFit: "contain" }} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut", delay: 0.14 }}
          style={{ fontSize: 26, color: "#1a1a1a", margin: "0 0 4px", fontWeight: 400 }}
        >
          Good to see you again
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut", delay: 0.2 }}
          style={{ fontSize: 13, color: "#a0756e", margin: 0 }}
        >
          South Lakes Integrated School
        </motion.p>
      </div>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.12 }}
        style={{
          maxWidth: 400, background: "white",
          borderRadius: 20, padding: "2rem", border: "1px solid #fde2de",
        }}
      >
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 8, padding: "8px 12px", fontSize: 13,
                color: "#b91c1c", marginBottom: "1rem",
              }}
              role="alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit}>
          {/* Identifier */}
          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{
              display: "block", fontSize: 12, fontWeight: 600, color: "#6b4040",
              letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6,
            }}>Email or name</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 12, color: "#cca9a4", display: "flex" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                required autoComplete="username" placeholder="e.g. juan@email.com"
                style={{
                  width: "100%", border: "1.5px solid #f0ceca", borderRadius: 10,
                  padding: "10px 12px 10px 38px", fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif", color: "#2d1a1a",
                  background: "#fffbfb", outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#e03131"; e.target.style.boxShadow = "0 0 0 3px rgba(224,49,49,0.1)"; e.target.style.background = "white"; }}
                onBlur={(e) => { e.target.style.borderColor = "#f0ceca"; e.target.style.boxShadow = "none"; e.target.style.background = "#fffbfb"; }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{
              display: "block", fontSize: 12, fontWeight: 600, color: "#6b4040",
              letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6,
            }}>Password</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 12, color: "#cca9a4", display: "flex" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="••••••••"
                style={{
                  width: "100%", border: "1.5px solid #f0ceca", borderRadius: 10,
                  padding: "10px 38px 10px 38px", fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif", color: "#2d1a1a",
                  background: "#fffbfb", outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#e03131"; e.target.style.boxShadow = "0 0 0 3px rgba(224,49,49,0.1)"; e.target.style.background = "white"; }}
                onBlur={(e) => { e.target.style.borderColor = "#f0ceca"; e.target.style.boxShadow = "none"; e.target.style.background = "#fffbfb"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute", right: 10, background: "none", border: "none",
                  cursor: "pointer", color: "#cca9a4", display: "flex", alignItems: "center", padding: 4,
                }}
              >
                <i className={`ti ${showPassword ? "ti-eye-off" : "ti-eye"}`} style={{ fontSize: 16 }} />
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div style={{ marginBottom: "1.4rem", fontSize: 13, textAlign: "right" }}>
            <button
              type="button"
              onClick={() => setForgotVisible((v) => !v)}
              style={{ background: "none", border: "none", color: "#e03131", fontWeight: 500, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", padding: 0 }}
            >
              Forgot password?
            </button>
            <AnimatePresence>
              {forgotVisible && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  style={{ marginTop: 8, padding: "8px 12px", background: "#fff8f6", border: "1px solid #fde2de", borderRadius: 8, fontSize: 12, color: "#7a5050", textAlign: "left", lineHeight: 1.5 }}
                >
                  Please contact your system administrator to reset your password.
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={loading ? {} : { scale: 1.02 }}
            whileTap={loading ? {} : { scale: 0.97 }}
            transition={{ duration: 0.13 }}
            style={{
              width: "100%", background: loading ? "#e87474" : "#e03131",
              color: "white", border: "none", borderRadius: 50,
              padding: "12px", fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.01em", transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </motion.button>
        </form>
      </motion.div>

      {/* Footer */}
      <motion.p
        className="relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.28 }}
        style={{ textAlign: "center", fontSize: 12, color: "#b49190", marginTop: "1.2rem" }}
      >
        Need help?{" "}
        <a href="mailto:admin@southlakes.edu" style={{ color: "#e03131", textDecoration: "none", fontWeight: 500 }}>
          Contact your administrator
        </a>
      </motion.p>
    </div>
  );
}
