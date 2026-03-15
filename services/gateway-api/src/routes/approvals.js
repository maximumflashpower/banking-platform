'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../infrastructure/financialDb');
const requireVerifiedWebStepUp = require('../middleware/requireVerifiedWebStepUp');
const webStepUpGuardService = require('../services/identity/webStepUpGuardService');
const { writeAuditEvent } = require('../services/audit/auditService');

const router = express.Router();

function isUuidLike(x) {
  return typeof x === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function getSpaceId(req) {
  const spaceId = req.header('X-Space-Id');
  return typeof spaceId === 'string' && spaceId.trim() ? spaceId.trim() : null;
}

function getCorrelationId(req) {
  const h = req.header('X-Correlation-Id');
  if (typeof h === 'string' && h.trim()) return h.trim();
  return uuid();
}

function getMemberId(req) {
  const m = req.header('X-Member-Id');
  return typeof m === 'string' && m.trim() ? m.trim() : null;
}

async function getLatestIntentState(client, intentId) {
  const r = await client.query(
    `
    SELECT state
    FROM payment_intent_states
    WHERE payment_intent_id = $1
    ORDER BY
      created_at DESC,
      CASE state
        WHEN 'settled' THEN 90
        WHEN 'failed' THEN 80
        WHEN 'rejected' THEN 70
        WHEN 'canceled' THEN 60
        WHEN 'queued' THEN 50
        WHEN 'approved' THEN 40
        WHEN 'pending_approval' THEN 30
        WHEN 'validated' THEN 20
        WHEN 'created' THEN 10
        ELSE 0
      END DESC
    LIMIT 1
    `,
    [intentId]
  );
  return r.rowCount ? r.rows[0].state : null;
}

async function emitApprovalInboxNotification({ spaceId, intentId, approvalId, status, correlationId }) {
  const base = process.env.NOTIFICATIONS_INTERNAL_URL;
  if (!base) return;

  try {
    const payload = {
      kind: 'payment_approval',
      space_id: spaceId,
      intent_id: intentId,
      approval_id: approvalId,
      status,
      correlation_id: correlationId
    };

    if (typeof fetch !== 'function') return;

    await fetch(`${base.replace(/\/+$/, '')}/internal/v1/notifications/financial-inbox/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // best-effort
  }
}

router.post(
  '/:intent_id/vote',
  requireVerifiedWebStepUp({
    getTargetType: () => 'payment_intent_approve',
    getTargetId: (req) => req.params.intent_id
  }),
  async (req, res, next) => {
    const spaceId = getSpaceId(req);
    const memberId = getMemberId(req);
    const correlationId = getCorrelationId(req);
    const intentId = req.params.intent_id;

    try {
      if (!spaceId) {
        return res.status(400).json({ error: 'invalid_request', message: 'X-Space-Id header is required' });
      }
      if (!isUuidLike(intentId)) {
        return res.status(400).json({ error: 'invalid_request', message: 'intent_id must be uuid' });
      }
      if (!isUuidLike(memberId)) {
        return res.status(400).json({ error: 'invalid_request', message: 'X-Member-Id header is required (uuid)' });
      }

      const { vote, comment } = req.body || {};
      if (vote !== 'approve' && vote !== 'reject') {
        return res.status(400).json({ error: 'invalid_request', message: "vote must be 'approve' or 'reject'" });
      }

      await db.query('BEGIN');

      let updated;
      let alreadyVoted;
      let syncedState = null;

      try {
        const latestIntentState = await getLatestIntentState(db, intentId);
        if (latestIntentState !== 'pending_approval') {
          await db.query('ROLLBACK');
          return res.status(409).json({
            error: 'invalid_intent_state',
            message: `Intent must be pending_approval to vote (current=${latestIntentState || 'unknown'})`
          });
        }

        const a = await db.query(
          `
          SELECT id, status, business_id
          FROM payment_approvals
          WHERE payment_intent_id = $1 AND space_id = $2
          LIMIT 1
          FOR UPDATE
          `,
          [intentId, spaceId]
        );

        if (a.rowCount === 0) {
          await db.query('ROLLBACK');
          return res.status(404).json({ error: 'not_found', message: 'No approval found for this intent/space' });
        }

        const approval = a.rows[0];

        if (approval.status !== 'pending') {
          await db.query('ROLLBACK');
          return res.status(409).json({
            error: 'approval_not_pending',
            message: `Approval is already ${approval.status}`
          });
        }

        const ins = await db.query(
          `
          INSERT INTO payment_approval_votes (
            id, approval_id, space_id, business_id, member_id, vote, comment, metadata
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          ON CONFLICT (approval_id, member_id) DO NOTHING
          RETURNING id
          `,
          [
            uuid(),
            approval.id,
            spaceId,
            approval.business_id,
            memberId,
            vote,
            typeof comment === 'string' ? comment : null,
            JSON.stringify({
              correlation_id: correlationId,
              step_up_session_id: req.stepUp.stepUpSessionId,
              web_session_id: req.stepUp.webSessionId,
              step_up_target_type: req.stepUp.targetType,
              step_up_target_id: req.stepUp.targetId
            })
          ]
        );

        alreadyVoted = ins.rowCount === 0;

        const a2 = await db.query(
          `
          SELECT id, status, approvals_count, rejections_count, required_approvals
          FROM payment_approvals
          WHERE id = $1
          `,
          [approval.id]
        );

        updated = a2.rows[0];

        if (updated.status === 'approved' || updated.status === 'rejected') {
          const targetState = updated.status === 'approved' ? 'approved' : 'rejected';
          const latest2 = await getLatestIntentState(db, intentId);

          if (latest2 !== targetState) {
            await db.query(
              `
              INSERT INTO payment_intent_states (
                id,
                payment_intent_id,
                state,
                correlation_id,
                created_at,
                updated_at
              )
              VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp())
              `,
              [uuid(), intentId, targetState, correlationId]
            );
            syncedState = targetState;
          }
        }

        await db.query('COMMIT');
      } catch (e) {
        try { await db.query('ROLLBACK'); } catch (_) {}
        throw e;
      }

      await webStepUpGuardService.consumeVerifiedStepUp({
        stepUpSessionId: req.stepUp.stepUpSessionId
      });

      await writeAuditEvent(req, {
        event_category: 'approval',
        event_type: 'approval.vote.recorded',
        action: 'vote',
        result: updated.status === 'approved' ? 'success' : updated.status,
        correlation_id: correlationId,
        actor_membership_id: memberId,
        actor_space_id: spaceId,
        target_type: 'payment_intent',
        target_id: intentId,
        http_status: 200,
        metadata: {
          approval_id: updated.id,
          vote,
          already_voted: alreadyVoted,
          synced_intent_state: syncedState,
          step_up_session_id: req.stepUp.stepUpSessionId,
          web_session_id: req.stepUp.webSessionId,
          approval_status: updated.status,
          approvals_count: updated.approvals_count,
          rejections_count: updated.rejections_count,
          required_approvals: updated.required_approvals
        }
      });

      if (updated.status === 'approved' || updated.status === 'rejected') {
        await emitApprovalInboxNotification({
          spaceId,
          intentId,
          approvalId: updated.id,
          status: updated.status,
          correlationId
        });
      }

      return res.status(200).json({
        ok: true,
        already_voted: alreadyVoted,
        synced_intent_state: syncedState,
        approval: {
          id: updated.id,
          status: updated.status,
          approvals_count: updated.approvals_count,
          rejections_count: updated.rejections_count,
          required_approvals: updated.required_approvals
        },
        step_up: {
          step_up_session_id: req.stepUp.stepUpSessionId,
          web_session_id: req.stepUp.webSessionId,
          target_type: req.stepUp.targetType,
          target_id: req.stepUp.targetId
        },
        correlation_id: correlationId
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;