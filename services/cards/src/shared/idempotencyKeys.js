const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function buildCaptureFallbackKey({ authorizationId, amount, currency, merchantRef, occurredAtBucket }) {
  return sha256([
    'capture',
    authorizationId || '',
    amount || '',
    currency || '',
    merchantRef || '',
    occurredAtBucket || ''
  ].join('|'));
}

function buildReversalFallbackKey({ authorizationId, amount, currency, providerCaptureId, occurredAtBucket }) {
  return sha256([
    'reversal',
    authorizationId || '',
    amount || '',
    currency || '',
    providerCaptureId || '',
    occurredAtBucket || ''
  ].join('|'));
}

module.exports = {
  sha256,
  buildCaptureFallbackKey,
  buildReversalFallbackKey