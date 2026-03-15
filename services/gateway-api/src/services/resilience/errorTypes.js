'use strict';

class ExternalTimeoutError extends Error {
  constructor(message = 'external_timeout', details = {}) {
    super(message);
    this.name = 'ExternalTimeoutError';
    this.code = 'EXTERNAL_TIMEOUT';
    this.retriable = true;
    this.category = 'timeout';
    this.http_status = 504;
    this.details = details;
    this.status = 504;
  }
}

class ExternalTransientError extends Error {
  constructor(message = 'external_transient_failure', details = {}) {
    super(message);
    this.name = 'ExternalTransientError';
    this.code = 'EXTERNAL_TRANSIENT';
    this.retriable = true;
    this.category = 'transient';
    this.http_status = 503;
    this.details = details;
    this.status = 503;
  }
}

class ExternalPermanentError extends Error {
  constructor(message = 'external_permanent_failure', details = {}) {
    super(message);
    this.name = 'ExternalPermanentError';
    this.code = 'EXTERNAL_PERMANENT';
    this.retriable = false;
    this.category = 'permanent';
    this.http_status = Number(details.status || details.http_status || 400);
    this.details = details;
    this.status = this.http_status;
  }
}

class IdempotencyConflictError extends Error {
  constructor(message = 'idempotency_conflict', details = {}) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.code = 'IDEMPOTENCY_CONFLICT';
    this.retriable = false;
    this.category = 'conflict';
    this.http_status = 409;
    this.details = details;
    this.status = 409;
  }
}

module.exports = {
  ExternalTimeoutError,
  ExternalTransientError,
  ExternalPermanentError,
  IdempotencyConflictError,
};

const ERROR_TYPES = {
  // ... existentes
  RAIL_DISABLED: 'RAIL_DISABLED'
};

module.exports = {
  ERROR_TYPES
};

const RAIL_DISABLED = 'RAIL_DISABLED';