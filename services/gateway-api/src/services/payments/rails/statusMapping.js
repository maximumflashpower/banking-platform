'use strict';

const DOMAIN_STATES = Object.freeze({
  SUBMITTED: 'submitted',
  PROCESSING: 'processing',
  SETTLED: 'settled',
  RETURNED: 'returned',
  FAILED: 'failed',
});

const PROVIDER_STATUS_MAP = Object.freeze({
  mock_ach: {
    submitted: DOMAIN_STATES.SUBMITTED,
    pending: DOMAIN_STATES.PROCESSING,
    processing: DOMAIN_STATES.PROCESSING,
    in_process: DOMAIN_STATES.PROCESSING,
    completed: DOMAIN_STATES.SETTLED,
    settled: DOMAIN_STATES.SETTLED,
    returned: DOMAIN_STATES.RETURNED,
    rejected: DOMAIN_STATES.FAILED,
    failed: DOMAIN_STATES.FAILED,
  },
});

function normalize(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function mapProviderStatusToDomain(provider, providerStatus) {
  const normalizedProvider = normalize(provider);
  const normalizedStatus = normalize(providerStatus);

  if (!normalizedProvider || !normalizedStatus) {
    return {
      recognized: false,
      domainStatus: null,
      reason: 'missing_provider_or_status',
    };
  }

  const providerMap = PROVIDER_STATUS_MAP[normalizedProvider];
  if (!providerMap) {
    return {
      recognized: false,
      domainStatus: null,
      reason: 'unsupported_provider',
    };
  }

  const domainStatus = providerMap[normalizedStatus];
  if (!domainStatus) {
    return {
      recognized: false,
      domainStatus: null,
      reason: 'unknown_provider_status',
    };
  }

  return {
    recognized: true,
    domainStatus,
    reason: null,
  };
}

module.exports = {
  DOMAIN_STATES,
  mapProviderStatusToDomain,
};