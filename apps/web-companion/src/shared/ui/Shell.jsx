import Nav from "./Nav.jsx";
import SpaceSwitcher from "./SpaceSwitcher.jsx";

export default function Shell({ currentPath, session, children }) {
  return (
    <div className="wc-shell">
      <Nav currentPath={currentPath} />

      <main className="wc-main">
        <header className="wc-header">
          <div>
            <div className="wc-header-title">Stage 7E — Web Companion UI</div>
            <div className="wc-header-subtitle">
              session={session?.status || "unknown"} · space={session?.activeSpaceId || "none"}
            </div>
          </div>

          <SpaceSwitcher session={session} />
        </header>

        <section className="wc-content">{children}</section>
      </main>
    </div>
  );
}