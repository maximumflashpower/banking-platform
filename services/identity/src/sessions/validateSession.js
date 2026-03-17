export function validateSession(session, requiredType = null) {
  if (!session) {
    throw new Error("session_not_found");
  }

  if (session.status !== "active") {
    throw new Error("session_not_active");
  }

  if (new Date(session.expires_at) <= new Date()) {
    throw new Error("session_expired");
  }

  if (requiredType && session.session_type !== requiredType) {
    throw new Error("invalid_session_type");
  }

  return true;
}