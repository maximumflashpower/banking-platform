'use strict';

const { hasAnyRole } = require('../repos/identity/rbacRepo');

function requireActor(req, res, next) {
  const actor = req.header('X-Actor-User-Id');
  if (!actor) return res.status(400).json({ ok: false, error: 'X-Actor-User-Id is required' });
  req.actor_user_id = actor;
  next();
}

function requireBusinessRole({ anyOf }) {
  if (!Array.isArray(anyOf) || anyOf.length === 0) {
    throw new Error('requireBusinessRole(anyOf) requires at least one role');
  }

  return async (req, res, next) => {
    try {
      const actor = req.actor_user_id || req.header('X-Actor-User-Id');
      if (!actor) return res.status(400).json({ ok: false, error: 'X-Actor-User-Id is required' });

      const businessId = req.params.id;
      if (!businessId) return res.status(400).json({ ok: false, error: 'business id is required in route param :id' });

      const ok = await hasAnyRole(businessId, actor, anyOf);
      if (!ok) return res.status(403).json({ ok: false, error: 'forbidden' });

      req.actor_user_id = actor;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireActor, requireBusinessRole };