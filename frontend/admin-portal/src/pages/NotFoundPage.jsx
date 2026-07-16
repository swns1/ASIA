import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { usePageTitle } from "../hooks/usePageTitle";
import { isTokenValid, getCurrentUser, homeFor } from "../utils/auth";

export default function NotFoundPage() {
  usePageTitle("Not Found");
  const navigate = useNavigate();

  function goHome() {
    navigate(isTokenValid() ? homeFor(getCurrentUser()) : "/login");
  }

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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
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
            borderRadius: 16,
            background: "#fff0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i className="ti ti-file-search" style={{ fontSize: 24, color: "#e08080" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>
          Page not found
        </div>
        <div style={{ fontSize: 13, color: "#7a5050", lineHeight: 1.7 }}>
          The page you're looking for doesn't exist or may have moved.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button
            onClick={() => navigate(-1)}
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
            Go back
          </button>
          <button
            onClick={goHome}
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
            {isTokenValid() ? "Go to dashboard" : "Go to login"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
