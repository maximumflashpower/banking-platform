'use strict';

const membersRepo = require('../repos/identity/membersRepo'); // ajusta

module.exports = function requireBusinessMembership({ requireRole } = {}) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const spaceId = req.session?.active_space_id;

      if (!userId) return res.status(401).json({ error: 'missing_user' });
      if (!spaceId) return res.status(400).json({ error: 'missing_active_space' });

      const member = await membersRepo.getBusinessMember({ space_id: spaceId, user_id: userId });
      if (!member) return res.status(403).json({ error: 'not_a_business_member' });

      if (requireRole && member.role !== requireRole) {
        return res.status(403).json({ error: 'insufficient_role' });
      }

      req.businessMember = member; // { role, space_id, business_id?, ... }
      return next();
    } catch (e) {
      return next(e);
    }
  };
};