import { API_BASE } from "./config";
let csrfToken = "";

async function decode(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    const details = (body?.error?.details || []).map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ");
    const error = new Error(`${body?.error?.message || `Admin API request failed (${response.status}).`}${details ? ` (${details})` : ""}`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

export async function refreshCsrfToken() {
  const response = await fetch(`${API_BASE}/csrf`, { credentials: "include" });
  const body = await decode(response);
  csrfToken = body.data.csrfToken;
  return csrfToken;
}

async function send(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (mutating) {
    if (!csrfToken) await refreshCsrfToken();
    headers.set("X-CSRF-Token", csrfToken);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return fetch(`${API_BASE}${path}`, { ...options, method, headers, credentials: "include" });
}

export async function adminRequest(path, options = {}) {
  let response = await send(path, options);
  if (response.status === 401 && options.retryAuth !== false && !path.includes("/auth/")) {
    await send("/admin/auth/refresh", { method: "POST" });
    response = await send(path, options);
  }
  return decode(response);
}

/* Downloads a file (e.g. a CSV export) with the admin session, refreshing it once if it expired. */
export async function adminDownload(path, filename) {
  let response = await send(path);
  if (response.status === 401) {
    await send("/admin/auth/refresh", { method: "POST" });
    response = await send(path);
  }
  if (!response.ok) await decode(response); // throws the API's error message
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Uploads one image to Cloudinary through the API; returns { url, publicId, ... }. */
export async function uploadImage(file, kind) {
  const body = new FormData();
  body.append("kind", kind);
  body.append("file", file);
  const result = await adminRequest("/admin/uploads", { method: "POST", body });
  return result.data;
}

export async function loginAdmin(email, password) {
  const response = await send("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return decode(response);
}

export async function logoutAdmin() {
  const response = await send("/admin/auth/logout", { method: "POST" });
  return decode(response);
}
