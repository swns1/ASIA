import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createStudent, getStudent, updateStudent } from "../api/studentApi";

const emptyForm = {
  lrn: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  sex: "male",
  birth_date: "",
  current_address: "",
  permanent_address: "",
  email: "",
  mobile_number: "",
  status: "active",
};

export default function StudentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (id) {
      getStudent(id).then((data) => setForm({ ...emptyForm, ...data }));
    }
  }, [id]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (id) {
      await updateStudent(id, form);
    } else {
      await createStudent(form);
    }
    navigate("/students");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f6", padding: 28, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }}>
          {id ? "Edit Student" : "Create Student"}
        </h2>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #fde2de",
            padding: 20,
            boxShadow: "0 6px 18px rgba(224,49,49,0.08)",
            display: "grid",
            gap: 10,
          }}
        >
          <input name="lrn" placeholder="LRN" value={form.lrn} onChange={handleChange} required />
          <input name="first_name" placeholder="First Name" value={form.first_name} onChange={handleChange} required />
          <input name="middle_name" placeholder="Middle Name" value={form.middle_name} onChange={handleChange} />
          <input name="last_name" placeholder="Last Name" value={form.last_name} onChange={handleChange} required />
          <input name="suffix" placeholder="Suffix" value={form.suffix} onChange={handleChange} />

          <select name="sex" value={form.sex} onChange={handleChange}>
            <option value="male">male</option>
            <option value="female">female</option>
          </select>

          <input type="date" name="birth_date" value={form.birth_date || ""} onChange={handleChange} required />
          <input name="email" placeholder="Email" value={form.email || ""} onChange={handleChange} />
          <input name="mobile_number" placeholder="Mobile Number" value={form.mobile_number || ""} onChange={handleChange} />

          <textarea name="current_address" placeholder="Current Address" value={form.current_address} onChange={handleChange} required />
          <textarea name="permanent_address" placeholder="Permanent Address" value={form.permanent_address} onChange={handleChange} required />

          <select name="status" value={form.status} onChange={handleChange}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="transferred">transferred</option>
            <option value="graduated">graduated</option>
            <option value="dropped">dropped</option>
          </select>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">{id ? "Update" : "Create"}</button>
            <button type="button" onClick={() => navigate("/students")}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}