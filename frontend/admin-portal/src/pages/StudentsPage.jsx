import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteStudent, getStudents } from "../api/studentApi";

export default function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading] = useState(false);

  const fetchStudents = async (nextPage = page, term = search) => {
    setLoading(true);
    try {
      const data = await getStudents({ page: nextPage, search: term });
      setStudents(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents(1, "");
  }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this student?")) return;
    await deleteStudent(id);
    fetchStudents(page, search);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f6", padding: 28, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 28, fontFamily: "'DM Serif Display', serif" }}>Students</h2>
            <p style={{ margin: "6px 0 0", color: "#a0756e", fontSize: 13 }}>
              Manage student records, search, and update.
            </p>
          </div>
          <button
            onClick={() => navigate("/students/new")}
            style={{
              background: "#e03131",
              color: "#fff",
              border: "none",
              padding: "10px 16px",
              borderRadius: 999,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(224,49,49,0.18)",
            }}
          >
            New Student
          </button>
        </div>

        {/* Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Search name or LRN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1.5px solid #f0ceca",
              background: "#fffbfb",
            }}
          />
          <button
            onClick={() => fetchStudents(1, search)}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #f7c8c2",
              background: "#fff1f0",
              color: "#7a2b2b",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>

        {/* Table */}
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #fde2de",
            padding: 16,
            boxShadow: "0 6px 18px rgba(224,49,49,0.08)",
          }}
        >
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table width="100%" cellPadding="10" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#7a2b2b" }}>
                  <th>ID</th>
                  <th>LRN</th>
                  <th>Name</th>
                  <th>Sex</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", color: "#a0756e", padding: 20 }}>
                      No records
                    </td>
                  </tr>
                )}
                {students.map((s) => (
                  <tr key={s.student_id} style={{ borderTop: "1px solid #fde2de" }}>
                    <td>{s.student_id}</td>
                    <td>{s.lrn}</td>
                    <td>{`${s.last_name}, ${s.first_name}`}</td>
                    <td>{s.sex}</td>
                    <td>{s.status}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => navigate(`/students/${s.student_id}`)}>View</button>
                      <button onClick={() => navigate(`/students/${s.student_id}/edit`)}>Edit</button>
                      <button onClick={() => handleDelete(s.student_id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button disabled={!pageMeta.previous} onClick={() => fetchStudents(page - 1, search)}>
            Prev
          </button>
          <button disabled={!pageMeta.next} onClick={() => fetchStudents(page + 1, search)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}