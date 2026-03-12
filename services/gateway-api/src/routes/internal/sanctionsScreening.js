const express = require('express');
const { runSanctionsScreening } = require('../../services/risk/sanctionsScreeningService');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

router.post('/internal/v1/risk/sanctions-screenings/run', async (req, res, next) => {
  try {
    const {
      subject_type,
      subject_id,
      screening_scope,
      subject_snapshot,
      matches,
      provider_reference
    } = req.body || {};

    if (!['kyc_individual', 'kyb_business', 'beneficial_owner'].includes(subject_type)) {
      return res.status(400).json({ error: 'invalid_subject_type' });
    }

    if (!isUuid(subject_id)) {
      return res.status(400).json({ error: 'invalid_subject_id' });
    }

    if (!['kyc', 'kyb', 'beneficial_owner'].includes(screening_scope)) {
      return res.status(400).json({ error: 'invalid_screening_scope' });
    }

    const result = await runSanctionsScreening({
      subject_type,
      subject_id,
      screening_scope,
      subject_snapshot: subject_snapshot || {},
      matches: Array.isArray(matches) ? matches : [],
      provider_reference: provider_reference || null,
      actor_id: 'gateway-api'
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;