const DEFAULT_API_BASE_URL = "/api/v1";

// Production requests stay on the admin host. Vercel proxies /api/v1 to the backend,
// keeping httpOnly auth cookies first-party instead of third-party.
export const API_BASE = (import.meta.env.DEV ? import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL : DEFAULT_API_BASE_URL).replace(/\/$/, "");
