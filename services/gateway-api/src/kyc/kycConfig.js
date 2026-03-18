'use strict';

function isKycEnabled() {
  return String(process.env.KYC_ENABLED || 'false').toLowerCase() === 'true';
}

module.exports = {
  isKycEnabled,
};