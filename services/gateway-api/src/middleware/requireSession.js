'use strict';

const sessionsRepo = require('../repos/identity/sessionsRepo'); // ajusta el path según tu repo

module.exports = async function requireSession(req, res, next) {
  try {
    const sid = req.header('x-session-id');
    if (!sid) return res.status(401).json({ error: 'missing_session' });

    const session = await sessionsRepo.getById(sid);
    if (!session) return res.status(401).json({ error: 'invalid_session' });

    // session: { session_id, user_id, active_space_id, ... }
    req.session = session;
    req.user = { id: session.user_id };

    return next();
  } catch (e) {
    return next(e);
  }
};