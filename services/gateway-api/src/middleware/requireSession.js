'use strict';

const sessionsRepo = require('../repos/identity/sessionsRepo');

module.exports = async function requireSession(req, res, next) {
  try {
    const sid = req.header('x-session-id');
    if (!sid) return res.status(401).json({ error: 'missing_session' });

    const session = await sessionsRepo.getById(sid);
    if (!session) return res.status(401).json({ error: 'invalid_session' });

    if (session.revoked_at) {
      return res.status(401).json({ error: 'revoked_session' });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: 'expired_session' });
    }

    req.session = {
      session_id: session.id,
      user_id: session.user_id,
      device_id: session.device_id,
      active_space_id: session.space_id,
      created_at: session.created_at,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at
    };

    req.user = { id: session.user_id };

    return next();
  } catch (e) {
    return next(e);
  }
};