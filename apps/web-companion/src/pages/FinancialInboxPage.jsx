import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";
import { ackInboxMessage, getInbox } from "../shared/api/inbox.js";

export default function FinancialInboxPage() {
  const { session } = useSession();
  const [items, setItems] = React.useState([]);
  const [error, setError] = React.useState("");

  async function load() {
    if (!session.activeSpaceId) return;
    try {
      setError("");
      const data = await getInbox(session.activeSpaceId);
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      setError(err?.body?.message || err.message);
    }
  }

  React.useEffect(() => {
    load();
  }, [session.activeSpaceId]);

  async function onAck(id) {
    try {
      await ackInboxMessage(id);
      await load();
    } catch (err) {
      setError(err?.body?.message || err.message);
    }
  }

  return (
    <div>
      <h2>Financial Inbox</h2>
      <p>Operational and financial alerts tied to the active space.</p>

      {error && <pre>{error}</pre>}

      <div className="wc-list">
        {items.map(item => (
          <div key={item.id} className="wc-card">
            <div><strong>{item.title || item.type || item.id}</strong></div>
            <div>{item.message || item.summary || "No summary"}</div>
            <div className="wc-row">
              <span>status={item.status || "unknown"}</span>
              <button onClick={() => onAck(item.id)}>Acknowledge</button>
            </div>
          </div>
        ))}
        {!items.length && <div className="wc-empty">No inbox messages for this space.</div>}
      </div>
    </div>
  );
}