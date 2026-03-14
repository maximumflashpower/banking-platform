import React from "react";
import { getWebSessionStatus } from "../api/auth.js";

const SessionContext = React.createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = React.useState({
    loading: true,
    authenticated: false,
    status: "loading",
    activeSpaceId: null,
    spaces: [],
  });

  const refresh = React.useCallback(async () => {
    try {
      const data = await getWebSessionStatus();
      setSession({
        loading: false,
        authenticated: !!data?.authenticated,
        status: data?.status || "active",
        activeSpaceId: data?.active_space_id || data?.space_id || null,
        spaces: data?.spaces || [],
        raw: data,
      });
    } catch (err) {
      setSession({
        loading: false,
        authenticated: false,
        status: "anonymous",
        activeSpaceId: null,
        spaces: [],
        error: err,
      });
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const value = React.useMemo(() => ({ session, refresh }), [session, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}