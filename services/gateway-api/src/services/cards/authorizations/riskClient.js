const http = require('http');

function postJson({ hostname, port, path, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname,
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve({
              statusCode: res.statusCode,
              body: parsed
            });
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('risk_request_timeout'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function evaluateRisk(payload, options = {}) {
  const hostname = process.env.RISK_SERVICE_HOST || 'risk';
  const port = Number(process.env.RISK_SERVICE_PORT || 3000);
  const path = process.env.RISK_DECISION_PATH || '/internal/v1/risk/decision/evaluate';
  const timeoutMs = Number(process.env.CARD_AUTH_RISK_TIMEOUT_MS || options.timeoutMs || 800);

  try {
    const response = await postJson({
      hostname,
      port,
      path,
      body: payload,
      timeoutMs
    });

    const decision = response?.body?.decision;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decision === 'approve') {
        return { ok: true, status: 'approved', raw: response.body };
      }

      if (decision === 'decline') {
        return { ok: true, status: 'declined', raw: response.body };
      }
    }

    return { ok: false, status: 'error', raw: response.body };
  } catch (error) {
    if (error && String(error.message).includes('timeout')) {
      return { ok: false, status: 'timeout', raw: { message: error.message } };
    }

    return { ok: false, status: 'error', raw: { message: error.message } };
  }
}

module.exports = {
  evaluateRisk
};