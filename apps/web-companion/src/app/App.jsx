import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";
import Shell from "../shared/ui/Shell.jsx";
import { resolveRoute } from "./routes.js";

function InnerApp() {
  const { session } = useSession();
  const [path, setPath] = React.useState(window.location.pathname);

  React.useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (session.loading) {
    return <div className="wc-centered">Loading web session…</div>;
  }

  const Page = resolveRoute(path, session.authenticated);

  if (!session.authenticated) {
    return <Page />;
  }

  return (
    <Shell currentPath={path} session={session}>
      <Page />
    </Shell>
  );
}

export default function App() {
  return <InnerApp />;
}