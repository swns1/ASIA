import axios from "axios";

const identityClient = axios.create({
  baseURL: import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth",
  withCredentials: true, // required for httpOnly refresh cookies
  timeout: 10000,
});

export async function login({ identifier, password, rememberMe }) {
  // backend should accept identifier as name or email
  const res = await identityClient.post("/login/", {
    identifier,
    password,
    remember_me: rememberMe,
  });
  return res.data;
}

export async function refreshToken() {
  const res = await identityClient.post("/refresh/");
  return res.data;
}

export async function logout() {
  const res = await identityClient.post("/logout/");
  return res.data;
}
