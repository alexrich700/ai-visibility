import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getAdminToken, setAdminToken, clearAdminToken } from "./queryClient";

interface AdminUserInfo {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AdminUserInfo | null;
  isLoading: boolean;
  login: (token: string, user: AdminUserInfo) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_INFO_KEY = "adminUserInfo";

function getSavedUser(): AdminUserInfo | null {
  try {
    const saved = sessionStorage.getItem(USER_INFO_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveUser(user: AdminUserInfo | null) {
  if (user) {
    sessionStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(USER_INFO_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUserInfo | null>(getSavedUser);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!getAdminToken() && !!user;

  const refreshUser = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setUser(null);
      saveUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        saveUser(data);
      } else {
        clearAdminToken();
        setUser(null);
        saveUser(null);
      }
    } catch {
      clearAdminToken();
      setUser(null);
      saveUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (token && !user) {
      refreshUser();
    } else if (token && user) {
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((token: string, userInfo: AdminUserInfo) => {
    setAdminToken(token);
    setUser(userInfo);
    saveUser(userInfo);
  }, []);

  const logout = useCallback(async () => {
    const token = getAdminToken();
    if (token) {
      try {
        await fetch("/api/admin/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
      } catch {}
    }
    clearAdminToken();
    setUser(null);
    saveUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
