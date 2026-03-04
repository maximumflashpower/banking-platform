const ALLOWED_TRANSITIONS = {
  created: ["validated", "rejected", "canceled"],
  validated: ["queued", "failed"],
  queued: ["settled", "failed"],
  settled: [],
  rejected: [],
  failed: [],
  canceled: []
};

function assertTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
}

module.exports = {
  assertTransition
};