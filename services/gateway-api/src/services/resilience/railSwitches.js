'use strict';

function parseBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getRailSwitches() {
  return {
    achEnabled: parseBooleanFlag(
      process.env.RAILS_ACH_ENABLED ?? process.env.ACH_RAIL_ENABLED,
      true
    ),
    cardsEnabled: parseBooleanFlag(process.env.RAILS_CARDS_ENABLED, true),
  };
}

function createRailDisabledError(rail, message) {
  const error = new Error(message || `${rail} rail is temporarily disabled`);
  error.code = 'RAIL_DISABLED';
  error.statusCode = 503;
  error.rail = rail;
  error.userMessage = message || `${rail} rail is temporarily disabled`;
  return error;
}

function assertRailEnabled(rail) {
  const switches = getRailSwitches();

  if (rail === 'ach' && !switches.achEnabled) {
    throw createRailDisabledError(
      'ach',
      'ACH transfers are temporarily unavailable. Please retry later.'
    );
  }

  if (rail === 'cards' && !switches.cardsEnabled) {
    throw createRailDisabledError(
      'cards',
      'Card processing is temporarily unavailable.'
    );
  }
}

module.exports = {
  getRailSwitches,
  createRailDisabledError,
  assertRailEnabled,
};