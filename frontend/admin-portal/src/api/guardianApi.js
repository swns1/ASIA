// guardianApi.js
import axios from "axios";

const studentClient = axios.create({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

studentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function getGuardiansByStudent(studentId) {
  const res = await studentClient.get("/guardians/", { params: { student_id: studentId } });
  return res.data;
}

export async function createGuardian(payload) {
  const res = await studentClient.post("/guardians/", payload);
  return res.data;
}

export async function updateGuardian(id, payload) {
  const res = await studentClient.put(`/guardians/${id}/`, payload);
  return res.data;
}

export async function deleteGuardian(id) {
  const res = await studentClient.delete(`/guardians/${id}/`);
  return res.data;
}