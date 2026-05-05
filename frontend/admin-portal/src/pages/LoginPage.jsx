import { useState } from "react";
import { login } from "../api/identityApi";
import logo from "../assets/south-lakes-logo.png";
import { useNavigate } from "react-router-dom";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function LoginPage() {
  const navigate = useNavigate(); // ✅ move hook here

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

      if (rememberMe) {
        localStorage.setItem("remember_login_until", Date.now() + ONE_WEEK_MS);
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
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#fff8f6", fontFamily: "'DM Sans', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
      `}</style>

      {/* Blobs */}
      <div className="absolute pointer-events-none" style={{
        top: -60, right: -30, width: 220, height: 220,
        borderRadius: "60% 40% 70% 30% / 50% 60% 40% 50%",
        background: "linear-gradient(135deg, #ff6b6b, #e03131)", opacity: 0.85,
      }} />
      <div className="absolute pointer-events-none" style={{
        bottom: -40, left: -20, width: 130, height: 130,
        borderRadius: "40% 60% 30% 70% / 60% 40% 60% 40%",
        background: "linear-gradient(135deg, #ff9a9a, #e03131)", opacity: 0.7,
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "55%", right: -50, width: 80, height: 80,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #ffcbcb, #ff6b6b)", opacity: 0.5,
      }} />

      {/* Header */}
      <div className="relative z-10 text-center mb-8">
        <div className="mx-auto mb-4 flex items-center justify-center" style={{
          width: 100, height: 100, borderRadius: "50%",
          background: "white", border: "2px solid #fdd",
          boxShadow: "0 2px 8px rgba(224,49,49,0.12)",
        }}>
          <img src={logo} alt="South Lakes Integrated School" style={{ height: 200, width: 200, objectFit: "contain" }} />
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#1a1a1a", margin: "0 0 4px", fontWeight: 400 }}>
          Good to see you again
        </h1>
        <p style={{ fontSize: 13, color: "#a0756e", margin: 0 }}>
          South Lakes Integrated School
        </p>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full" style={{
        maxWidth: 400, background: "white",
        borderRadius: 20, padding: "2rem", border: "1px solid #fde2de",
      }}>
        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5",
            borderRadius: 8, padding: "8px 12px", fontSize: 13,
            color: "#b91c1c", marginBottom: "1rem",
          }} role="alert">
            {error}
          </div>
        )}

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
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="••••••••"
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

          {/* Remember + Forgot */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.4rem", fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, color: "#7a5050", cursor: "pointer" }}>
              <input
                type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#e03131", cursor: "pointer" }}
              />
              Remember me (1 week)
            </label>
            <a href="/forgot-password" style={{ color: "#e03131", textDecoration: "none", fontWeight: 500 }}>
              Forgot password?
            </a>
          </div>

          {/* Submit */}
          <button
            type="submit" disabled={loading}
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
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="relative z-10" style={{ textAlign: "center", fontSize: 12, color: "#b49190", marginTop: "1.2rem" }}>
        Need help?{" "}
        <a href="mailto:admin@southlakes.edu" style={{ color: "#e03131", textDecoration: "none", fontWeight: 500 }}>
          Contact your administrator
        </a>
      </p>
    </div>
  );
}