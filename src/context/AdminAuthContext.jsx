import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminRequest, loginAdmin, logoutAdmin, refreshCsrfToken } from "../api/adminApi";

/* eslint-disable react/prop-types */
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const signIn = useCallback(async (email, password) => {
    setError("");
    await refreshCsrfToken();
    const result = await loginAdmin(email, password);
    setUser(result.data.user);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    await logoutAdmin();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        await refreshCsrfToken();
        const result = await adminRequest("/admin/auth/me");
        if (active) {
          setUser(result.data.user);
          setStatus("authenticated");
        }
      } catch (requestError) {
        if (active && requestError.status === 401) {
          setStatus("unauthenticated");
        } else if (active) {
          setError(requestError.message);
          setStatus("error");
        }
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  const value = { user, status, error, setError, signIn, signOut };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const auth = useContext(AdminAuthContext);
  if (!auth) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return auth;
}
