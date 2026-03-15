'use strict';

const {
  ExternalTimeoutError,
  ExternalTransientError,
  ExternalPermanentError,
  IdempotencyConflictError,
} = require('./errorTypes');

function safeMessage(error) {
  return error?.message || 'external_failure';
}

function classifyError(error) {
  if (error instanceof ExternalTimeoutError) {
    return {
      category: 'timeout',
      retriable: true,
      safe_message: safeMessage(error),
      http_status: 504,
    };
  }

  if (error instanceof ExternalTransientError) {
    return {
      category: 'transient',
      retriable: true,
      safe_message: safeMessage(error),
      http_status: 503,
    };
  }

  if (error instanceof ExternalPermanentError) {
    const status = Number(error?.status || error?.statusCode || 0);

    return {
      category: 'permanent',
      retriable: false,
      safe_message: safeMessage(error),
      http_status: status || 400,
    };
  }

  if (error instanceof IdempotencyConflictError) {
    return {
      category: 'conflict',
      retriable: false,
      safe_message: safeMessage(error),
      http_status: 409,
    };
  }

  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const name = String(error?.name || '');

  if (
    name === 'AbortError' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      category: code === 'ETIMEDOUT' || name === 'AbortError' ? 'timeout' : 'transient',
      retriable: true,
      safe_message: safeMessage(error),
      http_status: status || (code === 'ETIMEDOUT' || name === 'AbortError' ? 504 : 503),
    };
  }

  if (status === 409) {
    return {
      category: 'conflict',
      retriable: false,
      safe_message: safeMessage(error),
      http_status: 409,
    };
  }

  if (status >= 400 && status < 500) {
    return {
      category: 'permanent',
      retriable: false,
      safe_message: safeMessage(error),
      http_status: status,
    };
  }

  return {
    category: 'transient',
    retriable: true,
    safe_message: safeMessage(error),
    http_status: 503,
  };
}

module.exports = {
  classifyError,
};
