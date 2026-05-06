import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getStudent } from "../api/studentApi";

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);

  useEffect(() => {
    getStudent(id).then(setStudent);
  }, [id]);

  if (!student) return <p style={{ padding: 24 }}>Loading...</p>;

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f6", padding: 28, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }}>Student Details</h2>

        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #fde2de",
            padding: 20,
            boxShadow: "0 6px 18px rgba(224,49,49,0.08)",
          }}
        >
          <p><b>Student Number:</b> {student.student_number}</p>
          <p><b>LRN:</b> {student.lrn}</p>
          <p><b>Name:</b> {student.first_name} {student.middle_name} {student.last_name}</p>
          <p><b>Sex:</b> {student.sex}</p>
          <p><b>Status:</b> {student.status}</p>
          <p><b>Birth Date:</b> {student.birth_date}</p>
          <p><b>Email:</b> {student.email}</p>
          <p><b>Mobile:</b> {student.mobile_number}</p>
          <p><b>Current Address:</b> {student.current_address}</p>
          <p><b>Permanent Address:</b> {student.permanent_address}</p>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={() => navigate(`/students/${student.student_id}/edit`)}>Edit</button>
            <button onClick={() => navigate("/students")}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}