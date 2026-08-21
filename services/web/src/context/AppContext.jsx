import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { clearSession, isExpired, loadSession, saveSession } from "../auth/session.js";
import { login as apiLogin } from "../api/client.js";
import { flush, pendingCount } from "../sync/queue.js";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [outbox, setOutbox] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const refreshOutbox = useCallback(async () => {
    setOutbox(await pendingCount());
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (s && !isExpired(s)) setSession(s);
      await refreshOutbox();
      setReady(true);
    })();
  }, [refreshOutbox]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const token = await apiLogin(username, password);
    const s = await saveSession(token);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const sync = useCallback(async () => {
    if (!session) throw new Error("Not signed in");
    setSyncing(true);
    try {
      const summary = await flush(session.token, session.stationId);
      await refreshOutbox();
      setLastSync(new Date());
      return summary;
    } finally {
      setSyncing(false);
    }
  }, [session, refreshOutbox]);

  // Opportunistic flush when connectivity returns and there is a backlog.
  useEffect(() => {
    if (online && session && outbox > 0 && !syncing) {
      sync().catch(() => {
        /* stay queued; the user can retry from the Sync page */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, session]);

  const value = useMemo(
    () => ({
      session,
      ready,
      online,
      outbox,
      syncing,
      lastSync,
      login,
      logout,
      sync,
      refreshOutbox,
    }),
    [session, ready, online, outbox, syncing, lastSync, login, logout, sync, refreshOutbox],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
