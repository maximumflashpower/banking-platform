import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";
import { getPaymentIntents, voteApproval } from "../shared/api/finance.js";
import { runProtectedAction } from "../shared/stepup/runProtectedAction.js";

export default function ApprovalsPage() {
  const { session } = useSession();
  const [items, setItems] = React.useState([]);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function load() {
    if (!session.activeSpaceId) return;
    try {
      setError("");
      const data = await getPaymentIntents(session.activeSpaceId);
      const rows = Array.isArray(data) ? data : data?.items || data?.payment_intents || [];
      setItems(rows);
    } catch (err) {
      setError(err?.body?.message || err.message);
    }
  }

  React.useEffect(() => {
    load();
  }, [session.activeSpaceId]);

  async function onVote(intentId, decision) {
    setError("");
    setMessage("");

    try {
      await runProtectedAction(
        () => voteApproval(intentId, decision),
        {
          onStepUpRequired: () => {
            setMessage("Approval vote requires verified step-up on mobile.");
          },
        }
      );
      setMessage(`Vote recorded: ${decision}`);
      await load();
    } catch (err) {
      if (err?.body?.error !== "step_up_required") {
        setError(err?.body?.message || err.message);
      }
    }
  }

  const pending = items.filter(item =>
    ["pending_approval", "pending", "approval_required"].includes(item.state || item.status)
  );

  return (
    <div>
      <h2>Approvals</h2>
      <p>Protected financial actions for the active space.</p>

      {message && <div className="wc-banner">{message}</div>}
      {error && <pre>{error}</pre>}

      <div className="wc-list">
        {pending.map(item => (
          <div key={item.id} className="wc-card">
            <div><strong>{item.id}</strong></div>
            <div>state={item.state || "unknown"}</div>
            <div>amount={item.amount || item.total_amount || "n/a"}</div>
            <div>counterparty={item.counterparty || item.destination || "n/a"}</div>

            <div className="wc-row">
              <button onClick={() => onVote(item.id, "approve")}>Approve</button>
              <button onClick={() => onVote(item.id, "reject")}>Reject</button>
            </div>
          </div>
        ))}
        {!pending.length && <div className="wc-empty">No pending approvals.</div>}
      </div>
    </div>
  );
}