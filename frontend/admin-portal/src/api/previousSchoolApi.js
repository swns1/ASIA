// previousSchoolApi.js
import axios from "axios";

const studentClient = axios.create({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://127.0.0.1:8000/api",
  timeout: 10000,
});

studentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function getPreviousSchoolsByStudent(studentId) {
  const res = await studentClient.get("/previous_schools/", { params: { student_id: studentId } });
  return res.data;
}

export async function createPreviousSchool(payload) {
  const res = await studentClient.post("/previous_schools/", payload);
  return res.data;
}

export async function deletePreviousSchool(id) {
  const res = await studentClient.delete(`/previous_schools/${id}/`);
  return res.data;
}