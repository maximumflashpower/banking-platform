import React from "react";
import { useSession } from "../shared/session/SessionProvider.jsx";

export default function PersonalPage() {
  const { session } = useSession();

  return (
    <div>
      <h2>Personal</h2>
      <div className="wc-card">
        <div>Active space: {session.activeSpaceId || "none"}</div>
        <div>Use this area for personal-space views and controls.</div>
      </div>
    </div>
  );
}