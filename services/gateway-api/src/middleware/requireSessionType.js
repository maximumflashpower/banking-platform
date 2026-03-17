function requireSessionType(expectedType) {
  return function sessionTypeMiddleware(req, res, next) {
    const session = req.session;

    if (!session) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (session.session_type !== expectedType) {
      return res.status(403).json({ error: "invalid_session_type" });
    }

    return next();
  };
}

module.exports = { requireSessionType };