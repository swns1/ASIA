import { Component } from "react";
import { isTokenValid, getCurrentUser, homeFor } from "../utils/auth";

// Catches uncaught render-phase errors anywhere in the app and shows a
// recoverable screen instead of a blank white page. Mounted outside
// <BrowserRouter> in main.jsx, so navigation here uses window.location
// rather than useNavigate() -- also more robust if router state itself
// is what's corrupted.
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  handleReload = () => window.location.reload();

  handleGoHome = () => {
    window.location.href = isTokenValid() ? homeFor(getCurrentUser()) : "/login";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdf8f6",
          fontFamily: "'DM Sans', sans-serif",
          padding: 24,
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        `}</style>
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: "36px 40px",
            width: "100%",
            maxWidth: 420,
            boxShadow: "0 24px 64px rgba(224,49,49,0.12)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#fff0f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: "#e03131" }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: "#7a5050", lineHeight: 1.7 }}>
            This page ran into an unexpected error. You can reload the page or
            head back to a safe place.
          </div>
          <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
            <button
              onClick={this.handleGoHome}
              style={{
                flex: 1,
                height: 42,
                border: "1.5px solid #f0e0e0",
                borderRadius: 10,
                background: "white",
                fontSize: 13,
                color: "#7a5050",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Go home
            </button>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                height: 42,
                border: "none",
                borderRadius: 10,
                background: "linear-gradient(135deg, #e03131, #c92a2a)",
                fontSize: 13,
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 4px 16px rgba(224,49,49,0.3)",
              }}
            >
              Reload page
            </button>
          </div>
          {this.state.error?.message && (
            <details style={{ width: "100%", marginTop: 8, textAlign: "left" }}>
              <summary style={{ fontSize: 11, color: "#b09090", cursor: "pointer" }}>
                Technical details
              </summary>
              <pre
                style={{
                  fontSize: 11,
                  color: "#b09090",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  marginTop: 6,
                }}
              >
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
