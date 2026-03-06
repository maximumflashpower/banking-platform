'use strict';

const express = require('express');

const requireSession = require('../middleware/requireSession');
const requireBusinessMembership = require('../middleware/requireBusinessMembership');

const kybRepo = require('../repos/identity/kybRepo');
const spacesRepo = require('../repos/identity/spacesRepo'); // ajusta
const sessionsRepo = require('../repos/identity/sessionsRepo'); // para switch space

const router = express.Router();

/**
 * POST /public/v1/identity/kyb/start
 * body: { business_id, legal_name? }
 */
router.post('/kyb/start', requireSession, requireBusinessMembership(), async (req, res, next) => {
  try {
    const actor_user_id = req.user.id;
    const { business_id, legal_name } = req.body || {};

    if (!business_id) return res.status(400).json({ error: 'missing_business_id' });

    const out = await kybRepo.startKyb({ business_id, actor_user_id, legal_name });
    return res.status(200).json(out);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /public/v1/identity/kyb/submit
 * body: { business_id, provider_ref? }
 */
router.post('/kyb/submit', requireSession, requireBusinessMembership(), async (req, res, next) => {
  try {
    const actor_user_id = req.user.id;
    const { business_id, provider_ref } = req.body || {};
    if (!business_id) return res.status(400).json({ error: 'missing_business_id' });

    const out = await kybRepo.submitKyb({ business_id, actor_user_id, provider_ref: provider_ref || null });

    if (!out.ok) return res.status(409).json(out);
    return res.status(200).json(out);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /public/v1/identity/kyb/verify
 * body: { business_id, decision: 'verified'|'rejected' }
 *
 * Nota: esto simula “proveedor” / backoffice. En producción esto suele ser INTERNAL.
 */
router.post('/kyb/verify', requireSession, requireBusinessMembership({ requireRole: 'owner' }), async (req, res, next) => {
  try {
    const actor_user_id = req.user.id;
    const { business_id, decision } = req.body || {};
    if (!business_id) return res.status(400).json({ error: 'missing_business_id' });

    let out;
    if (decision === 'verified') out = await kybRepo.verifyKyb({ business_id, actor_user_id });
    else if (decision === 'rejected') out = await kybRepo.rejectKyb({ business_id, actor_user_id });
    else return res.status(400).json({ error: 'invalid_decision' });

    if (!out.ok) return res.status(409).json(out);
    return res.status(200).json(out);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /public/v1/identity/spaces/switch
 * body: { space_id }
 */
router.post('/spaces/switch', requireSession, async (req, res, next) => {
  try {
    const actor_user_id = req.user.id;
    const session_id = req.session.session_id || req.header('x-session-id');
    const { space_id } = req.body || {};

    if (!space_id) return res.status(400).json({ error: 'missing_space_id' });

    // Validar que el usuario pertenece a ese space
    const ok = await spacesRepo.userHasSpace({ user_id: actor_user_id, space_id });
    if (!ok) return res.status(403).json({ error: 'space_access_denied' });

    await sessionsRepo.setActiveSpace({ session_id, space_id });

    return res.status(200).json({ ok: true, active_space_id: space_id });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;