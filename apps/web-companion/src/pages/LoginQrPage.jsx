import React from "react";
import { createQrSession, getWebSessionStatus } from "../shared/api/auth.js";
import { useSession } from "../shared/session/SessionProvider.jsx";

export default function LoginQrPage() {
  const { session, setSession } = useSession();
  const [qr, setQr] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let timer;

    (async () => {
      try {
        const deviceIdWeb = session?.deviceIdWeb || "web-companion-stage7e";
        const data = await createQrSession(deviceIdWeb);
        setQr(data);

        timer = setInterval(async () => {
          try {
            const status = await getWebSessionStatus(data.sessionRequestId);

            if (status?.status === "active" && status?.sessionId) {
              setSession((prev) => ({
                ...prev,
                authenticated: true,
                webSessionId: status.sessionId,
                sessionRequestId: data.sessionRequestId,
                activeSpaceId: status.activeSpaceId || prev.activeSpaceId,
              }));

              window.location.assign("/personal");
            }
          } catch (_) {}
        }, 2000);
      } catch (err) {
        setError(err?.body || err.message);
      }
    })();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session?.deviceIdWeb, setSession]);

  return (
    <div className="wc-login">
      <h1>Web Companion Login</h1>

      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}

      {!qr && !error && <div>Creating QR session…</div>}

      {qr && (
        <div className="wc-card">
          <div>Scan with mobile to approve web session.</div>
          <pre>{JSON.stringify(qr, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
