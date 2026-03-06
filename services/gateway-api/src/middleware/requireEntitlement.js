'use strict';

const rbacRepo = require('../repos/identity/rbacRepo'); // ajusta

module.exports = function requireEntitlement(entitlement) {
  return async (req, res, next) => {
    try {
      const member = req.businessMember;
      if (!member) return res.status(500).json({ error: 'missing_business_member_context' });

      const allowed = await rbacRepo.roleHasEntitlement({
        business_id: member.business_id,
        role: member.role,
        entitlement,
      });

      if (!allowed) return res.status(403).json({ error: 'missing_entitlement', entitlement });

      return next();
    } catch (e) {
      return next(e);
    }
  };
};