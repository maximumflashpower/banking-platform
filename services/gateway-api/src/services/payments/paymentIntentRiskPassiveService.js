'use strict';

const { basicRiskScoring } = require('../../../../risk/src/core/basicRiskScoring');

function mapPaymentIntentToBasicRiskInput({ paymentIntent, context = {} }) {
  return {
    amount: Number(paymentIntent?.amount_cents || 0),
    recent_payment_count_24h: Number(context.recentPaymentCount24h || 0),
    is_new_counterparty: Boolean(context.isNewCounterparty || false),
    is_known_device:
      typeof context.isKnownDevice === 'boolean' ? context.isKnownDevice : true
  };
}

function createPaymentIntentRiskPassiveService({
  logger,
  recentPaymentCounter,
  counterpartyResolver,
  deviceTrustResolver
} = {}) {
  async function evaluatePassiveRisk({ paymentIntent, requestContext }) {
    try {
      let recentPaymentCount24h = 0;
      let isNewCounterparty = false;
      let isKnownDevice = true;

      try {
        if (recentPaymentCounter?.countLast24h) {
          const value = await recentPaymentCounter.countLast24h({
            actorUserId: paymentIntent?.payer_user_id,
            spaceId: paymentIntent?.space_id
          });

          recentPaymentCount24h = Number.isFinite(Number(value)) ? Number(value) : 0;
        }
      } catch (error) {
        logger?.warn?.('Passive risk fallback: recent_payment_count_24h=0', {
          payment_intent_id: paymentIntent?.id,
          error: error.message
        });
      }

      try {
        if (counterpartyResolver?.isNewCounterparty) {
          isNewCounterparty = Boolean(
            await counterpartyResolver.isNewCounterparty({
              paymentIntent,
              requestContext
            })
          );
        }
      } catch (error) {
        logger?.warn?.('Passive risk fallback: is_new_counterparty=false', {
          payment_intent_id: paymentIntent?.id,
          error: error.message
        });
      }

      try {
        if (deviceTrustResolver?.isKnownDevice) {
          isKnownDevice = Boolean(
            await deviceTrustResolver.isKnownDevice({ requestContext })
          );
        }
      } catch (error) {
        logger?.warn?.('Passive risk fallback: is_known_device=true', {
          payment_intent_id: paymentIntent?.id,
          error: error.message
        });
      }

      const scorerInput = mapPaymentIntentToBasicRiskInput({
        paymentIntent,
        context: {
          recentPaymentCount24h,
          isNewCounterparty,
          isKnownDevice
        }
      });

      const assessment = basicRiskScoring(scorerInput);

      if (!assessment) {
        return null;
      }

      return {
        score: assessment.score,
        reasons: Array.isArray(assessment.reasons) ? assessment.reasons : [],
        risk_level: assessment.risk_level
      };
    } catch (error) {
      logger?.warn?.('Passive risk evaluation failed; continuing without risk_assessment', {
        payment_intent_id: paymentIntent?.id,
        error: error.message
      });

      return null;
    }
  }

  return {
    evaluatePassiveRisk
  };
}

module.exports = {
  createPaymentIntentRiskPassiveService,
  mapPaymentIntentToBasicRiskInput
};
