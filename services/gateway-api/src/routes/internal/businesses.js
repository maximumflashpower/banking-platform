'use strict';

const express = require('express');
const router = express.Router();

const { requireActor, requireBusinessRole } = require('../../middleware/requireBusinessRole');
const { createBusiness, getBusinessAggregate } = require('../../repos/identity/businessesRepo');
const { startKyb, submitKyb } = require('../../repos/identity/kybRepo');
const { inviteMember, assignRole } = require('../../repos/identity/membersRepo');

function isUuid(v) {
  return typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// POST /internal/v1/businesses
router.post('/', requireActor, async (req, res, next) => {
  try {
    const legal_name = String(req.body?.legal_name || '').trim();
    if (!legal_name) return res.status(400).json({ ok: false, error: 'legal_name is required' });

    const business = await createBusiness({ legal_name, actor_user_id: req.actor_user_id });
    res.status(201).json({ ok: true, business });
  } catch (err) { next(err); }
});

// GET /internal/v1/businesses/:id
router.get(
  '/:id',
  requireActor,
  requireBusinessRole({ anyOf: ['OWNER_PRIMARY', 'OWNER', 'ADMIN', 'EMPLOYEE', 'FINANCE_APPROVER'] }),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'invalid business id' });

      const agg = await getBusinessAggregate(id);
      if (!agg) return res.status(404).json({ ok: false, error: 'not found' });

      res.json({ ok: true, ...agg });
    } catch (err) { next(err); }
  }
);

// POST /internal/v1/businesses/:id/kyb/start
router.post(
  '/:id/kyb/start',
  requireActor,
  requireBusinessRole({ anyOf: ['OWNER_PRIMARY', 'ADMIN'] }),
  async (req, res, next) => {
    try {
      const business_id = req.params.id;
      if (!isUuid(business_id)) return res.status(400).json({ ok: false, error: 'invalid business id' });

      const out = await startKyb({ business_id, actor_user_id: req.actor_user_id });
      res.json({ ok: true, ...out });
    } catch (err) { next(err); }
  }
);

// POST /internal/v1/businesses/:id/kyb/submit
router.post(
  '/:id/kyb/submit',
  requireActor,
  requireBusinessRole({ anyOf: ['OWNER_PRIMARY', 'ADMIN'] }),
  async (req, res, next) => {
    try {
      const business_id = req.params.id;
      if (!isUuid(business_id)) return res.status(400).json({ ok: false, error: 'invalid business id' });

      const provider_ref = req.body?.provider_ref || null;
      const payload = req.body?.payload || req.body || {};

      const out = await submitKyb({ business_id, actor_user_id: req.actor_user_id, provider_ref, payload });
      res.json({ ok: true, ...out });
    } catch (err) { next(err); }
  }
);

// POST /internal/v1/businesses/:id/members/invite
router.post(
  '/:id/members/invite',
  requireActor,
  requireBusinessRole({ anyOf: ['OWNER_PRIMARY', 'ADMIN'] }),
  async (req, res, next) => {
    try {
      const business_id = req.params.id;
      if (!isUuid(business_id)) return res.status(400).json({ ok: false, error: 'invalid business id' });

      const user_id = String(req.body?.user_id || '').trim();
      const role = String(req.body?.role || '').trim();

      if (!user_id) return res.status(400).json({ ok: false, error: 'user_id is required' });
      if (!role) return res.status(400).json({ ok: false, error: 'role is required' });

      const member = await inviteMember({ business_id, user_id, role, actor_user_id: req.actor_user_id });
      res.status(201).json({ ok: true, member });
    } catch (err) { next(err); }
  }
);

// POST /internal/v1/businesses/:id/roles/assign
router.post(
  '/:id/roles/assign',
  requireActor,
  requireBusinessRole({ anyOf: ['OWNER_PRIMARY'] }),
  async (req, res, next) => {
    try {
      const business_id = req.params.id;
      if (!isUuid(business_id)) return res.status(400).json({ ok: false, error: 'invalid business id' });

      const user_id = String(req.body?.user_id || '').trim();
      const role = String(req.body?.role || '').trim();

      if (!user_id) return res.status(400).json({ ok: false, error: 'user_id is required' });
      if (!role) return res.status(400).json({ ok: false, error: 'role is required' });

      const out = await assignRole({ business_id, user_id, role, actor_user_id: req.actor_user_id });
      res.json({ ok: true, ...out });
    } catch (err) { next(err); }
  }
);

module.exports = router;