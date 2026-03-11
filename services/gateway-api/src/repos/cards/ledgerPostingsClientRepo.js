'use strict';

function getBaseUrl() {
  return (
    process.env.LEDGER_INTERNAL_BASE_URL ||
    process.env.GATEWAY_INTERNAL_BASE_URL ||
    'http://127.0.0.1:3000'
  );
}

function buildUrl(pathname) {
  return `${getBaseUrl()}${pathname}`;
}

async function parseJsonSafe(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return { raw: text };
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.INTERNAL_HTTP_TIMEOUT_MS || 5000);

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      const error = new Error(`internal_http_error:${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`internal_http_timeout:${url}`);
    }

    if (error.message && error.message.startsWith('internal_http_error:')) {
      throw error;
    }

    throw new Error(`internal_http_fetch_failed:${url}:${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function commitCardSettlement(payload) {
  if (!payload?.spaceId) {
    throw new Error('space_id_required');
  }

  if (!payload?.idemKey) {
    throw new Error('idempotency_key_required');
  }

  if (!Array.isArray(payload?.postings) || payload.postings.length < 2) {
    throw new Error('postings_invalid');
  }

  try {
    return await fetchJson(buildUrl('/internal/v1/ledger/postings/commit'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.idemKey,
      },
      body: JSON.stringify({
        spaceId: payload.spaceId,
        idemKey: payload.idemKey,
        memo: payload.memo || null,
        effectiveAt: payload.effectiveAt || null,
        postings: payload.postings,
      }),
    });
  } catch (error) {
    if (error.message.startsWith('internal_http_error:')) {
      throw new Error(
        `ledger_postings_commit_failed:${JSON.stringify(error.data || {})}`
      );
    }

    throw error;
  }
}

module.exports = {
  commitCardSettlement,
};