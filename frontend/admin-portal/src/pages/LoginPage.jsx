import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { login } from "../api/identityApi";
import logo from "../assets/logo.png";
import { useNavigate } from "react-router-dom";
import { setCurrentUser } from "../utils/auth";

export default function LoginPage() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login({ identifier, password, rememberMe });
      sessionStorage.setItem("access_token", res.access);
      setCurrentUser(res.user);
      if (rememberMe) {
        localStorage.setItem(
          "remember_login_until",
          String(Date.now() + 7 * 24 * 60 * 60 * 1000)
        );
      } else {
        localStorage.removeItem("remember_login_until");
      }
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
    <div
      className="flex w-full overflow-hidden"
      style={{ height: "100vh", fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
      `}</style>

      {/* Left: Brand panel */}
      <div
        style={{
          width: 420,
          flexShrink: 0,
          background: "#180c0c",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 48,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -90,
            left: -70,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(224,49,49,0.26) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -50,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(224,49,49,0.09) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 60,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <img
                src={logo}
                alt="SLIS"
                style={{ width: 32, height: 32, objectFit: "contain" }}
              />
            </div>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "rgba(255,255,255,0.42)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              South Lakes IS
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 36,
              fontWeight: 600,
              color: "white",
              lineHeight: 1.25,
              marginBottom: 20,
              letterSpacing: "-0.01em",
            }}
          >
            Academic
            <br />
            System for
            <br />
            Integrated
            <br />
            Administration
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.36)",
              lineHeight: 1.85,
              maxWidth: 280,
            }}
          >
            Manage students, enrollments, billing, and academic records — all
            in one place.
          </p>
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 99,
              padding: "10px 18px",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4caf50",
                flexShrink: 0,
                boxShadow: "0 0 6px rgba(76,175,80,0.5)",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.48)",
              }}
            >
              S.Y. 2025–2026 · Active
            </span>
          </div>
          <p
            style={{
              marginTop: 12,
              fontSize: 10.5,
              color: "rgba(255,255,255,0.18)",
            }}
          >
            v2.0 · South Lakes Integrated School
          </p>
        </div>
      </div>

      {/* Right: Form panel */}
      <div
        style={{
          flex: 1,
          background: "#fdf8f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ width: "100%", maxWidth: 380 }}
        >
          <div style={{ marginBottom: 36 }}>
            <h2
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 28,
                fontWeight: 500,
                color: "#1a0a0a",
                marginBottom: 7,
                letterSpacing: "-0.01em",
              }}
            >
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: "#a07878" }}>
              Sign in to your account to continue.
            </p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "#b91c1c",
                  marginBottom: 18,
                }}
                role="alert"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit}>
            {/* Identifier */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#6b4040",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Email or username
              </label>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 14,
                    color: "#cca9a4",
                    pointerEvents: "none",
                    display: "flex",
                    zIndex: 1,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="e.g. admin@southlakes.edu"
                  style={{
                    width: "100%",
                    border: "1.5px solid #f0ceca",
                    borderRadius: 12,
                    padding: "12px 14px 12px 42px",
                    fontSize: 14,
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#2d1a1a",
                    background: "#fffbfb",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.15s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#e03131";
                    e.target.style.boxShadow =
                      "0 0 0 3px rgba(224,49,49,0.1)";
                    e.target.style.background = "white";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#f0ceca";
                    e.target.style.boxShadow = "none";
                    e.target.style.background = "#fffbfb";
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6b4040",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Password
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  style={{
                    fontSize: 12,
                    color: "#e03131",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Forgot password?
                </a>
              </div>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 14,
                    color: "#cca9a4",
                    pointerEvents: "none",
                    display: "flex",
                    zIndex: 1,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    border: "1.5px solid #f0ceca",
                    borderRadius: 12,
                    padding: "12px 14px 12px 42px",
                    fontSize: 14,
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#2d1a1a",
                    background: "#fffbfb",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.15s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#e03131";
                    e.target.style.boxShadow =
                      "0 0 0 3px rgba(224,49,49,0.1)";
                    e.target.style.background = "white";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#f0ceca";
                    e.target.style.boxShadow = "none";
                    e.target.style.background = "#fffbfb";
                  }}
                />
              </div>
            </div>

            {/* Remember me */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 28,
              }}
            >
              <input
                type="checkbox"
                id="remcheck"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: 15,
                  height: 15,
                  accentColor: "#e03131",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
              <label
                htmlFor="remcheck"
                style={{ fontSize: 13, color: "#7a5050", cursor: "pointer" }}
              >
                Remember me for 1 week
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading
                  ? "#e87474"
                  : "linear-gradient(135deg, #e03131, #c92a2a)",
                color: "white",
                border: "none",
                borderRadius: 50,
                padding: 14,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: "0.02em",
                boxShadow: "0 4px 20px rgba(224,49,49,0.28)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (loading) return;
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 8px 28px rgba(224,49,49,0.38)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 20px rgba(224,49,49,0.28)";
              }}
            >
              {loading ? "Signing in…" : "Sign in to your account"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#b49190",
              marginTop: 24,
            }}
          >
            Need help?{" "}
            <a
              href="mailto:admin@southlakes.edu"
              style={{
                color: "#e03131",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Contact administrator
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
