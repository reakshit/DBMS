import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('rail:unauthorized', logout);
    return () => window.removeEventListener('rail:unauthorized', logout);
  }, [logout]);

  const signIn = async (fn) => {
    const r = await fn();
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const value = {
    user, loading, logout,
    login: (email, password, accountType) => signIn(() => api.login(email, password, accountType)),
    register: (b) => signIn(() => api.register(b)),
    isStaff: user?.role === 'STAFF' || user?.role === 'ADMIN',
    isAdmin: user?.role === 'ADMIN',
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
