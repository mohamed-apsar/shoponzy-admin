const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? "/api/v1"
  : "https://shoponzy-backend.vercel.app/api/v1";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
