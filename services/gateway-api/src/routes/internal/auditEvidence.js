'use strict';

const express = require('express');
const immutableAuditRepo = require('../../repos/identity/immutableAuditRepo');

const router = express.Router();

router.get('/audit/evidence', async (req, res, next) => {
  try {
    const filters = {
      from: req.query.from || null,
      to: req.query.to || null,
      event_category: req.query.event_category || null,
      event_type: req.query.event_type || null,
      actor_user_id: req.query.actor_user_id || null,
      target_type: req.query.target_type || null,
      target_id: req.query.target_id || null,
      request_id: req.query.request_id || null,
      correlation_id: req.query.correlation_id || null,
      limit: req.query.limit || 100
    };
    const items = await immutableAuditRepo.listAuditEvents(filters);
    return res.status(200).json({
      ok: true,
      count: items.length,
      chain_verified: immutableAuditRepo.verifyAuditChain(items),
      generated_at: new Date().toISOString(),
      items
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
