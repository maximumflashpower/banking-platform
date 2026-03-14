import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";

export default function BusinessPage() {
  const { session } = useSession();

  return (
    <div>
      <h2>Business</h2>
      <div className="wc-card">
        <div>Active space: {session.activeSpaceId || "none"}</div>
        <div>Use this area for business-space actions and views.</div>
      </div>
    </div>
  );
}