import { createContext, useContext, useState } from "react";
import * as authApi from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  function persist(token, user) {
    setToken(token);
    setUser(user);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  }

  async function login(username, password) {
    const data = await authApi.login(username, password);
    persist(data.token, data.user || { username });
  }
  async function signup(username, password) {
    const data = await authApi.signup(username, password);
    persist(data.token, { username: data.username });
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return (
    <AuthContext.Provider value={{ token, user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}