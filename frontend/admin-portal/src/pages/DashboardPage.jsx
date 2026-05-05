export default function DashboardPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff8f6",
        fontFamily: "'DM Sans', sans-serif",
        color: "#2d1a1a",
        padding: "32px 20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto 28px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 32,
              margin: 0,
              fontWeight: 400,
            }}
          >
            Dashboard
          </h1>
          <p style={{ margin: "6px 0 0 0", color: "#a0756e", fontSize: 13 }}>
            Welcome back — here’s a quick overview.
          </p>
        </div>
        <button
          style={{
            background: "#e03131",
            border: "none",
            color: "white",
            padding: "10px 16px",
            borderRadius: 999,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 10px rgba(224,49,49,0.18)",
          }}
        >
          New Record
        </button>
      </div>

      {/* Cards */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        {[
          { label: "Total Students", value: "1,248" },
          { label: "Active Enrollments", value: "1,102" },
          { label: "Pending Payments", value: "₱ 82,500" },
          { label: "Requirements Missing", value: "64" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "white",
              borderRadius: 16,
              border: "1px solid #fde2de",
              padding: "18px 20px",
              boxShadow: "0 6px 18px rgba(224,49,49,0.08)",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "#a0756e" }}>
              {item.label}
            </p>
            <h3 style={{ margin: "6px 0 0 0", fontSize: 22 }}>{item.value}</h3>
          </div>
        ))}
      </div>

      {/* Activity Section */}
      <div
        style={{
          maxWidth: 1100,
          margin: "22px auto 0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 18,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #fde2de",
            padding: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Recent Activity</h3>
          <ul style={{ margin: "12px 0 0 0", paddingLeft: 16, color: "#6b4040" }}>
            <li>Juan D. enrolled in Grade 10 - Section A</li>
            <li>Payment posted for Invoice INV-1003</li>
            <li>Requirement submitted: PSA Birth Certificate</li>
            <li>New scholarship approved: Academic Excellence</li>
          </ul>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #fde2de",
            padding: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Quick Actions</h3>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {["Add Student", "Create Invoice", "Record Payment", "View Reports"].map(
              (label) => (
                <button
                  key={label}
                  style={{
                    width: "100%",
                    background: "#fff1f0",
                    border: "1px solid #f7c8c2",
                    color: "#7a2b2b",
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}