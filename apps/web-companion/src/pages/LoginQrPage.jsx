import React from "react";
import { createQrSession, getWebSessionStatus } from "../shared/api/auth.js";

export default function LoginQrPage() {
  const [qr, setQr] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let timer;

    (async () => {
      try {
        const data = await createQrSession();
        setQr(data);

        timer = setInterval(async () => {
          try {
            const status = await getWebSessionStatus();
            if (status?.authenticated) {
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
  }, []);

  return (
    <div className="wc-login">
      <h1>Web Companion Login</h1>
      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}

      {!qr && !error && <div>Creating QR session…</div>}

      {qr && (
        <>
          <div className="wc-card">
            <div>Scan with mobile to approve web session.</div>
            {qr.qr_url && (
              <div className="wc-qr-wrap">
                <img src={qr.qr_url} alt="Web companion QR" className="wc-qr" />
              </div>
            )}
            <pre>{JSON.stringify(qr, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
}