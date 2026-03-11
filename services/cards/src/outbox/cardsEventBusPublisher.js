const fs = require('fs/promises');
const path = require('path');

const TOPIC_MAP = {
  'card.dispute.opened.v1': 'cards-bus/card.dispute.opened.v1.topic',
  'card.dispute.resolved.v1': 'cards-bus/card.dispute.resolved.v1.topic',
  'card.capture.duplicate_detected.v1': 'cards-bus/card.capture.received.v1.topic',
  'card.reversal.orphaned.v1': 'cards-bus/card.reversal.received.v1.topic',
  'card.reversal.linked.v1': 'cards-bus/card.reversal.received.v1.topic'
};

async function publish({ topic, key, payload, headers = {} }) {
  const brokerMode = process.env.CARDS_EVENT_BUS_MODE || 'file';

  if (brokerMode === 'fail') {
    throw new Error('cards event bus forced failure');
  }

  if (brokerMode === 'file') {
    const baseDir = process.env.CARDS_EVENT_BUS_DIR || path.resolve(process.cwd(), 'tmp/cards-bus');
    await fs.mkdir(baseDir, { recursive: true });
    const filePath = path.join(baseDir, `${Date.now()}-${String(key).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    await fs.writeFile(filePath, JSON.stringify({ topic, key, headers, payload }, null, 2), 'utf8');
    return { ok: true, transport: 'file', filePath };
  }

  return { ok: true, transport: 'noop' };
}

function resolveTopic(eventType) {
  return TOPIC_MAP[eventType] || `cards-bus/${eventType}.topic`;
}

module.exports = {
  publish,
  resolveTopic
};