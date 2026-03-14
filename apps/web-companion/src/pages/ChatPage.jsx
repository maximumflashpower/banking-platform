import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";
import { getConversations } from "../shared/api/social.js";

export default function ChatPage() {
  const { session } = useSession();
  const [items, setItems] = React.useState([]);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      if (!session.activeSpaceId) return;
      try {
        const data = await getConversations(session.activeSpaceId);
        setItems(Array.isArray(data) ? data : data?.items || []);
      } catch (err) {
        setError(err?.body?.message || err.message);
      }
    })();
  }, [session.activeSpaceId]);

  return (
    <div>
      <h2>Chat</h2>
      {error && <pre>{error}</pre>}
      <div className="wc-list">
        {items.map(item => (
          <div key={item.id} className="wc-card">
            <strong>{item.title || item.id}</strong>
          </div>
        ))}
        {!items.length && <div className="wc-empty">No conversations.</div>}
      </div>
    </div>
  );
}