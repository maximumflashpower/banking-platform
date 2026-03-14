import React from "react";
import { useSession } from "../session/SessionProvider.jsx";
import { getSpaces, switchSpace } from "../api/identity.js";
import { runProtectedAction } from "../stepup/runProtectedAction.js";

export default function SpaceSwitcher() {
  const { session, refresh } = useSession();
  const [spaces, setSpaces] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const data = await getSpaces();
        setSpaces(Array.isArray(data) ? data : data?.spaces || []);
      } catch (_) {}
    })();
  }, []);

  async function onChange(e) {
    const spaceId = e.target.value;
    if (!spaceId || spaceId === session.activeSpaceId) return;

    setLoading(true);
    setMessage("");

    try {
      await runProtectedAction(
        () => switchSpace(spaceId),
        {
          onStepUpRequired: () => {
            setMessage("Space switch requires verified step-up on mobile.");
          },
        }
      );
      await refresh();
      setMessage("Space switched.");
    } catch (err) {
      if (err?.body?.error !== "step_up_required") {
        setMessage(err?.body?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wc-space-switcher">
      <select value={session.activeSpaceId || ""} onChange={onChange} disabled={loading}>
        <option value="">Select space</option>
        {spaces.map(space => (
          <option key={space.id} value={space.id}>
            {space.id} ({space.type})
          </option>
        ))}
      </select>
      {message && <span className="wc-inline-message">{message}</span>}
    </div>
  );
}