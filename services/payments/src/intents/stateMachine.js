const ALLOWED_TRANSITIONS = {
  created: ["validated", "rejected", "canceled"],
  validated: ["pending_approval", "queued", "failed"],     // +pending_approval
  pending_approval: ["approved", "rejected", "canceled"],  // nuevo
  approved: ["queued"],                                   // nuevo (vuelve al flujo)
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