'use strict';

const webQrSessionRepo = require('../../repos/identity/webQrSessionRepo');

async function invalidateForMobileLogout({ userId }) {
  return webQrSessionRepo.invalidateAllActiveSessionsForUser({
    userId,
    eventType: 'mobile_logout',
    actorType: 'mobile_session',
    actorId: userId,
    payloadJson: {}
  });
}

async function invalidateForPasswordChange({ userId, changedBy = null }) {
  return webQrSessionRepo.invalidateAllActiveSessionsForUser({
    userId,
    eventType: 'password_changed',
    actorType: 'identity',
    actorId: changedBy || userId,
    payloadJson: {}
  });
}

async function invalidateForRoleChange({ userId, changedBy = null, roleContext = {} }) {
  return webQrSessionRepo.invalidateAllActiveSessionsForUser({
    userId,
    eventType: 'role_changed',
    actorType: 'identity',
    actorId: changedBy || userId,
    payloadJson: roleContext
  });
}

async function invalidateForFreezeSevere({ userId, reason = 'freeze_severe' }) {
  return webQrSessionRepo.invalidateAllActiveSessionsForUser({
    userId,
    eventType: 'freeze_severe',
    actorType: 'risk',
    actorId: 'risk-engine',
    payloadJson: { reason }
  });
}

async function expireInactiveSessions() {
  return webQrSessionRepo.expireInactiveActiveSessions();
}

module.exports = {
  invalidateForMobileLogout,
  invalidateForPasswordChange,
  invalidateForRoleChange,
  invalidateForFreezeSevere,
  expireInactiveSessions
};