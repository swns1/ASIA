// studentApi.js
import axios from "axios";

const studentClient = axios.create({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://127.0.0.1:8000/api",
  timeout: 10000,
});

// Request interceptor — attach token
studentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — auto refresh on 401
studentClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const res = await axios.post(
          "http://localhost:8001/api/auth/refresh/",
          {},
          { withCredentials: true }
        );

        const newToken = res.data.access;
        sessionStorage.setItem("access_token", newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return studentClient(originalRequest);
      } catch (refreshError) {
        sessionStorage.removeItem("access_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export async function getStudents({ page = 1, search = "", status = "", sex = "", ordering = "" } = {}) {
  const res = await studentClient.get("/students/", {
    params: {
      page,
      search,
      ...(status   && { status }),
      ...(sex      && { sex }),
      ...(ordering && { ordering }),
    },
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

export async function bulkCreateStudent(payload) {
  // payload: { student, household, guardians[] }
  const res = await studentClient.post("/students/bulk-create/", payload);
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