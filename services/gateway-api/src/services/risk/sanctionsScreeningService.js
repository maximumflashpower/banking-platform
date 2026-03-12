const sanctionsScreeningsRepo = require('../../repos/risk/sanctionsScreeningsRepo');
const sanctionsScreeningCasesRepo = require('../../repos/cases/sanctionsScreeningCasesRepo');

function normalizeMatches(matches) {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches.map((match) => ({
    entity_name: match.entity_name || null,
    list_name: match.list_name || null,
    match_score: Number.isFinite(Number(match.match_score)) ? Number(match.match_score) : 0,
    disposition: match.disposition || 'clear'
  }));
}

function deriveOutcome(matches) {
  const normalizedMatches = normalizeMatches(matches);

  if (normalizedMatches.length === 0) {
    return {
      screening_status: 'clear',
      reason_code: 'SANCTIONS_CLEAR',
      confidence_score: 0,
      matched_entities: []
    };
  }

  const hasConfirmed = normalizedMatches.some(
    (item) => item.disposition === 'confirmed_match'
  );

  if (hasConfirmed) {
    const confidence = normalizedMatches.reduce(
      (max, item) => Math.max(max, item.match_score || 0),
      0
    );

    return {
      screening_status: 'confirmed_match',
      reason_code: 'SANCTIONS_CONFIRMED_MATCH',
      confidence_score: confidence,
      matched_entities: normalizedMatches
    };
  }

  const hasPotential = normalizedMatches.some(
    (item) =>
      item.disposition === 'potential_match' ||
      (item.match_score || 0) >= 70
  );

  if (hasPotential) {
    const confidence = normalizedMatches.reduce(
      (max, item) => Math.max(max, item.match_score || 0),
      0
    );

    return {
      screening_status: 'potential_match',
      reason_code: 'SANCTIONS_POTENTIAL_MATCH',
      confidence_score: confidence,
      matched_entities: normalizedMatches
    };
  }

  return {
    screening_status: 'clear',
    reason_code: 'SANCTIONS_CLEAR',
    confidence_score: 0,
    matched_entities: normalizedMatches
  };
}

async function runSanctionsScreening({
  subject_type,
  subject_id,
  screening_scope,
  subject_snapshot,
  matches,
  provider_reference,
  actor_id
}) {
  const outcome = deriveOutcome(matches);

  const screening = await sanctionsScreeningsRepo.insertScreening({
    subject_type,
    subject_id,
    screening_scope,
    screening_status: outcome.screening_status,
    provider_reference,
    subject_snapshot: subject_snapshot || {},
    matched_entities: outcome.matched_entities,
    reason_code: outcome.reason_code,
    confidence_score: outcome.confidence_score,
    created_by: actor_id || 'system'
  });

  let caseRecord = null;

  if (outcome.screening_status === 'potential_match') {
    caseRecord = await sanctionsScreeningCasesRepo.createPotentialMatchCase({
      screeningId: screening.id,
      subjectType: subject_type,
      subjectId: subject_id,
      reasonCode: outcome.reason_code,
      providerReference: provider_reference,
      matchedEntities: outcome.matched_entities
    });

    await sanctionsScreeningsRepo.updateScreeningCaseId(screening.id, caseRecord.id);
    screening.case_id = caseRecord.id;
  }

  await sanctionsScreeningsRepo.appendAuditEvent({
    entityType: 'sanctions_screening',
    entityId: screening.id,
    eventType: 'risk.sanctions_screening.recorded',
    actorType: 'internal_service',
    actorId: actor_id || 'gateway-api',
    payload: {
      subject_type,
      subject_id,
      screening_scope,
      screening_status: screening.screening_status,
      reason_code: screening.reason_code,
      confidence_score: screening.confidence_score,
      case_id: screening.case_id || null
    }
  });

  return {
    screening_id: screening.id,
    screening_status: screening.screening_status,
    reason_code: screening.reason_code,
    confidence_score: screening.confidence_score,
    case_id: screening.case_id || null
  };
}

module.exports = {
  runSanctionsScreening
};