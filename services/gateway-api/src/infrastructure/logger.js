'use strict';

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ error: 'log_serialize_failed' });
  }
}

function write(level, message, fields = {}) {
  const line = {
    ts: nowIso(),
    level,
    service: 'gateway-api',
    msg: message,
    ...fields
  };
  process.stdout.write(`${safeJson(line)}\n`);
}

module.exports = {
  info(message, fields) {
    write('info', message, fields);
  },
  warn(message, fields) {
    write('warn', message, fields);
  },
  error(message, fields) {
    write('error', message, fields);
  }
};