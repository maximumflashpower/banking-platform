'use strict';

const express = require('express');
const requireSession = require('../middleware/requireSession');
const webQrSessionRepo = require('../repos/identity/webQrSessionRepo');

const router = express.Router();

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

router.post('/qr/session/request', async (req, res, next) => {
  try {
    const deviceIdWeb = String(req.body?.deviceIdWeb || '').trim();

    if (!deviceIdWeb) {
      return badRequest(res, 'deviceIdWeb is required');
    }

    const session = await webQrSessionRepo.createSessionRequest({
      deviceIdWeb,
      ttlSeconds: 180
    });

    return res.status(201).json({
      sessionRequestId: session.sessionRequestId,
      qrPayload: JSON.stringify({
        sessionRequestId: session.sessionRequestId
      }),
      expiresAt: session.expiresAt
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/qr/session/confirm', requireSession, async (req, res, next) => {
  try {
    const sessionRequestId = String(req.body?.sessionRequestId || '').trim();
    const deviceIdWeb = String(req.body?.deviceIdWeb || '').trim();
    const spaceId = req.body?.spaceId ? String(req.body.spaceId).trim() : null;

    if (!sessionRequestId || !deviceIdWeb) {
      return badRequest(res, 'sessionRequestId and deviceIdWeb are required');
    }

    const result = await webQrSessionRepo.confirmSessionRequest({
      sessionRequestId,
      userId: req.session.user_id,
      deviceIdWeb,
      activeSpaceId: spaceId,
      ttlSeconds: 900
    });

    if (!result) {
      return res.status(404).json({ error: 'web_session_request_not_found' });
    }

    if (result.conflict === 'expired') {
      return res.status(409).json({
        error: 'web_session_request_expired',
        sessionRequestId,
        status: 'expired'
      });
    }

    if (result.conflict === 'revoked') {
      return res.status(409).json({
        error: 'web_session_request_revoked',
        sessionRequestId,
        status: 'revoked'
      });
    }

    return res.status(202).json({
      status: 'active',
      sessionId: result.session.sessionId,
      sessionRequestId: result.session.sessionRequestId,
      confirmedAt: result.session.confirmedAt,
      expiresAt: result.session.expiresAt,
      activeSpaceId: result.session.activeSpaceId
    });
  } catch (error) {
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'session_request_id_invalid' });
    }

    return next(error);
  }
});

router.get('/session/status', async (req, res, next) => {
  try {
    const sessionRequestId = String(req.query?.sessionRequestId || '').trim();

    if (!sessionRequestId) {
      return badRequest(res, 'sessionRequestId is required');
    }

    const session = await webQrSessionRepo.getSessionStatusByRequestId(sessionRequestId);

    if (!session) {
      return res.status(404).json({ error: 'web_session_request_not_found' });
    }

    if (session.status !== 'active') {
      return res.status(200).json({
        status: session.status,
        sessionRequestId: session.sessionRequestId,
        expiresAt: session.expiresAt,
        invalidatedReason: session.invalidatedReason || null,
        invalidatedAt: session.invalidatedAt || null
      });
    }

    await webQrSessionRepo.touchLastSeen(session.sessionId);

    return res.status(200).json({
      status: session.status,
      sessionId: session.sessionId,
      sessionRequestId: session.sessionRequestId,
      userId: session.userId,
      activeSpaceId: session.activeSpaceId,
      confirmedAt: session.confirmedAt,
      expiresAt: session.expiresAt,
      invalidatedReason: session.invalidatedReason || null,
      invalidatedAt: session.invalidatedAt || null
    });
  } catch (error) {
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'session_request_id_invalid' });
    }

    return next(error);
  }
});

router.post('/session/logout', requireSession, async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!sessionId) {
      return badRequest(res, 'sessionId is required');
    }

    const session = await webQrSessionRepo.revokeSession({
      sessionId,
      userId: req.session.user_id,
      reason: 'revoked'
    });

    if (!session) {
      return res.status(404).json({ error: 'active_web_session_not_found' });
    }

    return res.status(202).json({
      status: 'revoked',
      sessionId: session.sessionId
    });
  } catch (error) {
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'session_id_invalid' });
    }

    return next(error);
  }
});

module.exports = router;