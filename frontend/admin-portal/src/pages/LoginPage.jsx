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

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      // Guardians land in the parent portal; staff go to the admin dashboard.
      navigate(res.user?.role === "guardian" ? "/guardian" : "/dashboard");
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
    <div className="login-stage">
      <style>{`
        .login-stage{display:flex;width:100%;min-height:100vh;overflow:hidden;font-family:'DM Sans',sans-serif;}
        .login-brand{width:420px;flex-shrink:0;background:#180c0c;display:flex;flex-direction:column;justify-content:space-between;padding:48px;position:relative;overflow:hidden;}
        .login-dotgrid{position:absolute;inset:0;background-image:radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px);background-size:20px 20px;pointer-events:none;}
        .login-glow-a{position:absolute;bottom:-90px;left:-70px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle, rgba(224,49,49,0.26) 0%, transparent 70%);pointer-events:none;animation:loginDriftA 9s ease-in-out infinite;}
        .login-glow-b{position:absolute;top:-60px;right:-50px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle, rgba(224,49,49,0.09) 0%, transparent 70%);pointer-events:none;animation:loginDriftB 11s ease-in-out infinite;}
        @keyframes loginDriftA{0%,100%{transform:translate(0,0) scale(1);opacity:.85}50%{transform:translate(14px,-10px) scale(1.06);opacity:1}}
        @keyframes loginDriftB{0%,100%{transform:translate(0,0) scale(1);opacity:.7}50%{transform:translate(-10px,8px) scale(1.1);opacity:1}}
        .login-headline-line{display:block;opacity:0;transform:translateY(10px);animation:loginLineIn .5s ease-out forwards;}
        .login-headline-line:nth-child(1){animation-delay:.05s}
        .login-headline-line:nth-child(2){animation-delay:.16s}
        .login-headline-line:nth-child(3){animation-delay:.27s}
        .login-headline-line:nth-child(4){animation-delay:.38s}
        @keyframes loginLineIn{to{opacity:1;transform:translateY(0)}}
        .login-status-dot{animation:loginDotPulse 2.2s ease-out infinite;}
        @keyframes loginDotPulse{0%{box-shadow:0 0 0 0 rgba(76,175,80,.55)}70%{box-shadow:0 0 0 7px rgba(76,175,80,0)}100%{box-shadow:0 0 0 0 rgba(76,175,80,0)}}
        .login-submit{position:relative;overflow:hidden;transition:transform .15s,box-shadow .15s;}
        .login-submit:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(224,49,49,0.38);}
        .login-submit::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(115deg,transparent,rgba(255,255,255,.35),transparent);animation:loginSweep 3.6s ease-in-out infinite;}
        @keyframes loginSweep{0%{left:-60%}45%{left:130%}100%{left:130%}}
        @media (max-width: 768px){
          .login-stage{flex-direction:column;height:auto;}
          .login-brand{width:100%;padding:28px 24px;}
          .login-brand .login-sub{display:none;}
          .login-brand h1{font-size:26px;margin-bottom:8px;}
          .login-brand-bottom{margin-top:20px;}
        }
        @media (prefers-reduced-motion: reduce){
          .login-glow-a,.login-glow-b,.login-headline-line,.login-status-dot,.login-submit::after{animation:none !important;}
          .login-headline-line{opacity:1;transform:none;}
        }
      `}</style>

      {/* Left: Brand panel */}
      <div className="login-brand">
        <div className="login-dotgrid" />
        <div className="login-glow-a" />
        <div className="login-glow-b" />

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
                fontSize: 12,
                fontWeight: 600,
                // Opacities on this dark panel were raised to meet WCAG AA:
                // 0.42 measured 3.6:1 against #180c0c.
                color: "rgba(255,255,255,0.72)",
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
            <span className="login-headline-line">Academic</span>
            <span className="login-headline-line">System for</span>
            <span className="login-headline-line">Integrated</span>
            <span className="login-headline-line">Administration</span>
          </h1>
          <p
            className="login-sub"
            style={{
              fontSize: 14,
              // was 0.36 — measured 3.30:1, below the 4.5:1 minimum
              color: "rgba(255,255,255,0.62)",
              lineHeight: 1.85,
              maxWidth: 280,
            }}
          >
            Manage students, enrollments, billing, and academic records — all
            in one place.
          </p>
        </div>

        <div className="login-brand-bottom" style={{ position: "relative" }}>
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
              className="login-status-dot"
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
                color: "rgba(255,255,255,0.72)",
              }}
            >
              S.Y. 2025–2026 · Active
            </span>
          </div>
          <p
            style={{
              marginTop: 12,
              // 10.5px was below the 11px readability floor; 0.18 was ~1.6:1
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
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
            <p style={{ fontSize: 14, color: "#855c5c" }}>
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
                htmlFor="login-identifier"
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
                    color: "#8a6a6a",
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
                  id="login-identifier"
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
                  htmlFor="login-password"
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
                {/* Was a dead `href="#"` link that did nothing on click.
                    Password reset isn't wired up yet (see README), so this is
                    plain text pointing at a real path to get one rather than a
                    control that looks interactive and silently fails. */}
                <span
                  style={{
                    fontSize: 12,
                    color: "#8a6a6a",
                    fontWeight: 500,
                  }}
                >
                  Forgot? Contact an admin.
                </span>
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
                    color: "#8a6a6a",
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
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    border: "1.5px solid #f0ceca",
                    borderRadius: 12,
                    padding: "12px 42px 12px 42px",
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
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 14,
                    background: "none",
                    border: "none",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    color: "#8a6a6a",
                    cursor: "pointer",
                    zIndex: 1,
                    fontSize: 15,
                  }}
                >
                  <i className={`ti ${showPassword ? "ti-eye-off" : "ti-eye"}`} />
                </button>
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
              className="login-submit"
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
              }}
            >
              {loading ? "Signing in…" : "Sign in to your account"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#8a6a6a",
              marginTop: 24,
            }}
          >
            Need help?{" "}
            <a
              href="mailto:admin@southlakes.edu"
              style={{
                color: "#c92a2a",
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
