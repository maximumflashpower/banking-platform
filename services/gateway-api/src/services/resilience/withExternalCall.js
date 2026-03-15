'use strict';

const logger = require('../../infrastructure/logger');
const { classifyError } = require('./classifyError');
const { withTimeout } = require('./withTimeout');

async function withExternalCall(options) {
  const {
    operation,
    timeoutMs,
    execute,
    fallback,
    onError,
  } = options || {};

  try {
    return await withTimeout(
      async () => execute(),
      timeoutMs,
      { operation }
    );
  } catch (error) {
    const classified = classifyError(error);

    logger.error('external_call_failed', {
      operation: operation || 'unknown_external_call',
      category: classified.category,
      retriable: classified.retriable,
      http_status: classified.http_status,
      error_message: classified.safe_message,
    });

    if (typeof onError === 'function') {
      try {
        await onError(error, classified);
      } catch (hookError) {
        logger.error('external_call_error_hook_failed', {
          operation: operation || 'unknown_external_call',
          error_message: hookError?.message || 'error hook failed',
        });
      }
    }

    if (typeof fallback === 'function') {
      return fallback(error, classified);
    }

    error.classified = classified;
    throw error;
  }
}

module.exports = {
  withExternalCall,
};
