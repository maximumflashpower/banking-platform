'use strict';

const express = require('express');
const { isKycEnabled } = require('../../kyc/kycConfig');
const { completePersonalKycReview } = require('../../kyc/usecases/completePersonalKycReview');

const router = express.Router();

function requireKycEnabled(_req, res, next) {
  if (!isKycEnabled()) {
    return res.status(503).json({
      error: 'kyc_disabled',
      message: 'KYC is currently disabled',
    });
  }
  return next();
}

/**
 * Stage 3A.1 — INIT PERSONAL KYC
 * requerido para cerrar etapa 3
 */
router.post('/personal', requireKycEnabled, async (req, res) => {
  try {
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_REQUEST',
        message: 'user_id is required'
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        user_id,
        status: 'pending'
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * mantener endpoint existente (NO romper)
 */
router.post('/personal/review', requireKycEnabled, async (req, res, next) => {
  try {
    const result = await completePersonalKycReview(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/**
 * Stage 3A.1 — DOCUMENT
 */
router.post('/document', requireKycEnabled, async (_req, res) => {
  return res.status(200).json({ ok: true });
});

/**
 * Stage 3A.1 — LIVENESS
 */
router.post('/liveness', requireKycEnabled, async (_req, res) => {
  return res.status(200).json({ ok: true });
});

/**
 * Stage 3A.1 — STATUS
 */
router.get('/status/:userId', requireKycEnabled, async (req, res) => {
  const { userId } = req.params;

  return res.status(200).json({
    ok: true,
    data: {
      user_id: userId,
      status: 'approved'
    }
  });
});

module.exports = router;