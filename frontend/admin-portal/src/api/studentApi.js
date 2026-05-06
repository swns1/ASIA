import axios from "axios";

const studentClient = axios.create({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://127.0.0.1:8000/api",
  timeout: 10000,
});

studentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function getStudents({ page = 1, search = "" } = {}) {
  const res = await studentClient.get("/students/", {
    params: { page, search },
  });
  return res.data;
}

export async function getStudent(id) {
  const res = await studentClient.get(`/students/${id}/`);
  return res.data;
}

export async function createStudent(payload) {
  const res = await studentClient.post("/students/", payload);
  return res.data;
}

export async function updateStudent(id, payload) {
  const res = await studentClient.put(`/students/${id}/`, payload);
  return res.data;
}

export async function deleteStudent(id) {
  const res = await studentClient.delete(`/students/${id}/`);
  return res.data;
}