const STEPS_MS = [5000, 15000, 60000, 300000, 900000, 3600000];

function getBackoffMs(attemptNumber) {
  const index = Math.max(0, Math.min(STEPS_MS.length - 1, Number(attemptNumber || 1) - 1));
  return STEPS_MS[index];
}

function nextRetryDate(attemptNumber, baseDate = new Date()) {
  return new Date(baseDate.getTime() + getBackoffMs(attemptNumber));
}

module.exports = {
  getBackoffMs,
  nextRetryDate
};